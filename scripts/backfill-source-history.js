/**
 * 소스 적중률 정식 이력 백필.
 *
 * 감사(원문 수량만 확인, AI/파일 변경 없음):
 *   node scripts/backfill-source-history.js --audit --years 2
 * 적용(Claude 재분석, 가격 수집, history/posts 갱신):
 *   node scripts/backfill-source-history.js --apply --years 2
 *
 * 캐시는 node_modules/.cache/source-history-v1.json에 체크포인트되므로 같은 실행을 재개할 수 있다.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { requestHistoricalJSON } from './lib/historical-analysis.js';
import {
  parseTelegramMessages, resolveStockCode, fetchClosesDated,
  fetchIndexClosesDated, fetchForeignIndexClosesDated,
} from './collect-rss.js';
import { computeSourceScores, HITRATE_SCHEMA_VERSION } from './hitrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'public/data/history.json');
const POSTS_PATH = path.join(ROOT, 'public/data/posts.json');
const AUDIT_PATH = path.join(ROOT, 'public/data/source-history-audit.json');
const CODES_PATH = path.join(ROOT, 'config/stock-codes.json');
const CACHE_PATH = path.join(ROOT, 'node_modules/.cache/source-history-v1.json');
const BLOGS = readJSON(path.join(ROOT, 'config/blogs.json'), { blogs: [] }).blogs;
const CHANNELS = readJSON(path.join(ROOT, 'config/telegram-channels.json'), { channels: [] }).channels;
const ALIASES = readJSON(path.join(ROOT, 'config/stock-aliases.json'), {});
const APPLY = process.argv.includes('--apply');
const AUDIT = process.argv.includes('--audit') || !APPLY;
const yearsAt = process.argv.indexOf('--years');
const YEARS = yearsAt >= 0 ? Math.max(1, Number(process.argv[yearsAt + 1]) || 2) : 2;
const MAX_BLOG_PAGES = 200;
const MAX_TELEGRAM_PAGES = 1200;
const PRICE_DAYS = Math.ceil(YEARS * 366 + 45);
const cutoffDate = (() => {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - YEARS);
  return date.toISOString().slice(0, 10);
})();
const today = new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/\x00/g, '').trim()); }
  catch { return fallback; }
}

function writeJSON(file, value, pretty = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : 0), 'utf8');
}

async function get(url, referer = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0', ...(referer ? { Referer: referer } : {}) },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timer); }
}

function kstDate(offset = 0) {
  return new Date(Date.now() - offset * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

function parseNaverDate(value) {
  const absolute = String(value).match(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (absolute) return `${absolute[1]}-${absolute[2].padStart(2, '0')}-${absolute[3].padStart(2, '0')}`;
  if (/어제/.test(value)) return kstDate(1);
  if (/방금|\d+시간 전|\d+분 전/.test(value)) return kstDate(0);
  return null;
}

function decodeTitle(value) {
  const unescaped = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try { return decodeURIComponent(unescaped.replace(/\+/g, ' ')); }
  catch { return unescaped; }
}

function parseNaverList(raw) {
  const rows = [];
  const pattern = /"logNo":"(\d+)"[\s\S]*?"title":"((?:\\.|[^"])*)"[\s\S]*?"addDate":"([^"]*)"/g;
  for (const match of raw.matchAll(pattern)) {
    const date = parseNaverDate(match[3]);
    if (date) rows.push({ id: match[1], title: decodeTitle(match[2]), date });
  }
  return rows;
}

function extractBody(html) {
  const paragraphs = [...html.matchAll(/class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
    .map((match) => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#8203;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (paragraphs.length) return paragraphs.join(' ');
  const legacy = html.match(/id="postViewArea"[^>]*>([\s\S]*?)<\/div>/);
  return legacy ? legacy[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

async function collectBlogInventory() {
  const items = [];
  const coverage = [];
  for (const blog of BLOGS) {
    let reached = false;
    let pages = 0;
    let oldest = null;
    let failed = '';
    for (let page = 1; page <= MAX_BLOG_PAGES && !reached; page++) {
      try {
        const raw = await get(`https://blog.naver.com/PostTitleListAsync.naver?blogId=${blog.id}&currentPage=${page}&countPerPage=30&categoryNo=0`, 'https://blog.naver.com/');
        const rows = parseNaverList(raw);
        if (!rows.length) break;
        pages = page;
        for (const row of rows) {
          oldest = !oldest || row.date < oldest ? row.date : oldest;
          if (row.date < cutoffDate) { reached = true; continue; }
          items.push({ key: `blog:${blog.id}:${row.id}`, source: 'blog', sourceId: blog.id, person: blog.person, url: `https://blog.naver.com/${blog.id}/${row.id}`, ...row });
        }
        await sleep(80);
      } catch (error) { failed = error.message; break; }
    }
    const count = items.filter((item) => item.sourceId === blog.id).length;
    coverage.push({ source: 'blog', id: blog.id, person: blog.person, count, pages, oldest, reachedCutoff: reached, error: failed || null });
    console.log(`  블로그 ${blog.person}: ${count}개 (${pages}p${failed ? `, ${failed}` : ''})`);
  }
  return { items, coverage };
}

async function collectTelegramInventory() {
  const items = [];
  const coverage = [];
  for (const channel of CHANNELS) {
    let before = '';
    let pages = 0;
    let reached = false;
    let oldest = null;
    let failed = '';
    const seen = new Set();
    let previousMinId = Infinity;
    while (pages < MAX_TELEGRAM_PAGES && !reached) {
      try {
        const html = await get(`https://t.me/s/${channel.id}${before ? `?before=${before}` : ''}`);
        const ids = [...html.matchAll(new RegExp(`data-post="${channel.id}\\/(\\d+)"`, 'g'))].map((match) => Number(match[1]));
        if (!ids.length) break;
        const minId = Math.min(...ids);
        if (minId >= previousMinId) {
          failed = 'pagination-stalled';
          break;
        }
        previousMinId = minId;
        const messages = parseTelegramMessages(html, channel.id);
        let added = 0;
        for (const message of messages) {
          if (!message.postDate || seen.has(message.url)) continue;
          seen.add(message.url);
          oldest = !oldest || message.postDate < oldest ? message.postDate : oldest;
          if (message.postDate < cutoffDate) { reached = true; continue; }
          const id = message.url.split('/').at(-1);
          items.push({ key: `telegram:${channel.id}:${id}`, id, source: 'telegram', sourceId: channel.id, person: channel.person, date: message.postDate, title: message.text.slice(0, 120), content: message.text, url: message.url });
          added++;
        }
        if (added === 0 && messages.every((message) => message.postDate >= cutoffDate)) {
          failed = 'pagination-no-progress';
          break;
        }
        before = minId;
        pages++;
        await sleep(AUDIT ? 20 : 250);
      } catch (error) { failed = error.message; break; }
    }
    if (!reached && pages >= MAX_TELEGRAM_PAGES && !failed) failed = 'max-pages-reached';
    const count = items.filter((item) => item.sourceId === channel.id).length;
    coverage.push({ source: 'telegram', id: channel.id, person: channel.person, count, pages, oldest, reachedCutoff: reached, error: failed || null });
    console.log(`  텔레그램 ${channel.person}: ${count}개 (${pages}p${failed ? `, ${failed}` : ''})`);
  }
  return { items, coverage };
}

async function pool(items, size, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (cursor < items.length) await worker(items[cursor], cursor++);
  }));
}

function groupTelegramBySourceDay(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `telegram-day:${item.sourceId}:${item.date}`;
    const group = groups.get(key) || {
      key, id: item.date, source: 'telegram', sourceId: item.sourceId, person: item.person,
      date: item.date, title: `${item.person} 텔레그램 ${item.date}`, url: item.url,
      messages: [], originalCount: 0,
    };
    group.messages.push(item.content);
    group.originalCount++;
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    content: group.messages.map((message, index) => `[메시지 ${index + 1}] ${message}`).join('\n\n').slice(0, 12000),
  }));
}

async function analyzeHistorical(client, item, content) {
  const prompt = `투자 글의 작성자 직접 의견만 적중률 검증용으로 추출하세요. 전달한 뉴스·공시·리포트의 결론을 작성자 의견으로 바꾸지 마세요. 종목마다 방향이 다르면 따로 적으세요. 글에 없는 종목이나 방향을 만들지 마세요.\n\n작성자: ${item.person}\n제목: ${item.title}\n본문: ${content.slice(0, 12000)}\n\nJSON만 출력:\n{"source_role":"opinion|fact|mixed","evidence_grade":"A|B|C|D|F","evidence_reason":"짧은 근거","opinions":[{"stock":"정식 종목명","stance":"강세|약세","reason":"작성자의 직접 주장 근거"}]}\n직접 방향성 의견이 확실하지 않으면 opinions는 빈 배열입니다.`;
  const result = await requestHistoricalJSON(client, prompt);
  const sourceRole = ['opinion', 'fact', 'mixed'].includes(result.source_role) ? result.source_role : 'mixed';
  const opinions = sourceRole !== 'fact' && Array.isArray(result.opinions) ? result.opinions
    .filter((op) => op && ['강세', '약세'].includes(op.stance) && typeof op.stock === 'string')
    .map((op) => ({ stock: ALIASES[op.stock.trim()] || op.stock.trim(), stance: op.stance, reason: String(op.reason || '').slice(0, 300) })) : [];
  return { source_role: sourceRole, evidence_grade: /^[A-F]$/.test(result.evidence_grade) ? result.evidence_grade : 'D', evidence_reason: String(result.evidence_reason || '').slice(0, 300), opinions };
}

console.log(`소스 이력 ${AUDIT ? '감사' : '적용'}: ${cutoffDate}~${today}`);
const blogInventory = await collectBlogInventory();
const telegramInventory = await collectTelegramInventory();
const telegramDays = groupTelegramBySourceDay(telegramInventory.items);
const allItems = [...blogInventory.items, ...telegramDays];
const auditReport = {
  version: HITRATE_SCHEMA_VERSION, generatedAt: new Date().toISOString(), mode: AUDIT ? 'audit' : 'apply',
  range: { years: YEARS, start: cutoffDate, end: today },
  totals: {
    blogPosts: blogInventory.items.length,
    telegramMessages: telegramInventory.items.length,
    rawOriginals: blogInventory.items.length + telegramInventory.items.length,
    telegramSourceDays: telegramDays.length,
    analysisUnits: allItems.length,
  },
  sources: [...blogInventory.coverage, ...telegramInventory.coverage],
};
if (AUDIT) {
  console.log(JSON.stringify(auditReport, null, 2));
  process.exit(0);
}
if (!process.env.CLAUDE_API_KEY) throw new Error('CLAUDE_API_KEY가 필요합니다. GitHub Actions Secrets에서 실행하세요.');

const cache = readJSON(CACHE_PATH, {});
const missing = allItems.filter((item) => !cache[item.key]);
console.log(`Claude 분석: 전체 ${allItems.length}, 캐시 ${allItems.length - missing.length}, 신규 ${missing.length}`);
const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
let completed = 0;
let failed = 0;
await pool(missing, 3, async (item) => {
  try {
    let content = item.content || '';
    if (item.source === 'blog') {
      const html = await get(`https://m.blog.naver.com/PostView.naver?blogId=${item.sourceId}&logNo=${item.id}`, 'https://blog.naver.com/');
      content = extractBody(html) || item.title;
    }
    cache[item.key] = { ...await analyzeHistorical(client, item, content), analyzedAt: new Date().toISOString(), analysisDepth: content === item.title ? 'title_only' : 'full_text' };
  } catch (error) {
    failed++;
    console.warn(`  실패 ${item.key}: ${error.message}`);
  }
  completed++;
  if (completed % 25 === 0) {
    writeJSON(CACHE_PATH, cache);
    console.log(`  ${completed}/${missing.length} (실패 ${failed})`);
  }
});
writeJSON(CACHE_PATH, cache);

const opinionRows = [];
for (const item of allItems) {
  const analysis = cache[item.key];
  if (!analysis || analysis.source_role === 'fact') continue;
  for (const opinion of analysis.opinions || []) opinionRows.push({ item, analysis, opinion });
}
const stockNames = [...new Set(opinionRows.map((row) => row.opinion.stock))];
console.log(`공식 방향성 의견 ${opinionRows.length}개, 종목 ${stockNames.length}개`);

const indexByDate = {};
const addIndex = (label, rows) => rows.forEach((row) => (indexByDate[row.date] ||= {})[label] = row.close);
addIndex('KOSPI', await fetchIndexClosesDated('KOSPI', PRICE_DAYS));
addIndex('KOSDAQ', await fetchIndexClosesDated('KOSDAQ', PRICE_DAYS));
addIndex('NASDAQ', await fetchForeignIndexClosesDated('.IXIC', PRICE_DAYS));
addIndex('SP500', await fetchForeignIndexClosesDated('.INX', PRICE_DAYS));

const codes = readJSON(CODES_PATH, {});
const priceByDate = {};
const marketOf = {};
const unresolved = [];
for (let i = 0; i < stockNames.length; i++) {
  const stock = stockNames[i];
  const info = await resolveStockCode(stock, codes);
  if (!info) { unresolved.push(stock); continue; }
  marketOf[stock] = info.market;
  try {
    const closes = await fetchClosesDated(info, PRICE_DAYS);
    closes.forEach((row) => (priceByDate[row.date] ||= {})[stock] = row.close);
  } catch { unresolved.push(stock); }
  if ((i + 1) % 25 === 0) console.log(`  시세 ${i + 1}/${stockNames.length}`);
  await sleep(180);
}
writeJSON(CODES_PATH, codes, true);

const history = readJSON(HISTORY_PATH, {});
for (const date of new Set([...Object.keys(indexByDate), ...Object.keys(priceByDate)])) {
  const previous = history[date] || {};
  history[date] = { prices: { ...(previous.prices || {}), ...(priceByDate[date] || {}) }, indices: { ...(previous.indices || {}), ...(indexByDate[date] || {}) }, opinions: previous.opinions || [] };
}
const officialByDate = {};
for (const { item, analysis, opinion } of opinionRows) {
  const market = marketOf[opinion.stock];
  if (!market) continue;
  (officialByDate[item.date] ||= []).push({
    person: item.person, stock: opinion.stock, stance: opinion.stance, market,
    source_role: 'opinion', hitrate_version: HITRATE_SCHEMA_VERSION,
    source: item.source, source_id: item.sourceId, post_id: item.id, url: item.url,
    evidence_grade: analysis.evidence_grade, evidence_reason: analysis.evidence_reason,
    opinion_reason: opinion.reason, analysis_depth: analysis.analysisDepth,
  });
}
for (const [date, rows] of Object.entries(officialByDate)) {
  const previous = history[date] || { prices: {}, indices: {}, opinions: [] };
  const legacy = (previous.opinions || []).filter((op) => op.hitrate_version !== HITRATE_SCHEMA_VERSION);
  const unique = new Map(rows.map((op) => [`${op.source}:${op.post_id}:${op.stock}`, op]));
  history[date] = { ...previous, opinions: [...legacy, ...unique.values()] };
}
const keepDates = Object.keys(history).sort().filter((date) => date >= cutoffDate);
const pruned = Object.fromEntries(keepDates.map((date) => [date, history[date]]));
const scores = computeSourceScores(pruned);
scores.backfill = {
  status: failed ? 'partial' : 'complete', generatedAt: new Date().toISOString(),
  range: auditReport.range, originals: allItems.length, analyzed: allItems.length - failed,
  failed, directionalOpinions: opinionRows.length, resolvedStocks: Object.keys(marketOf).length,
  unresolvedStocks: unresolved,
};
const posts = readJSON(POSTS_PATH, {});
posts.source_scores = scores;
auditReport.mode = 'apply';
auditReport.result = scores.backfill;
writeJSON(HISTORY_PATH, pruned);
writeJSON(POSTS_PATH, posts, true);
writeJSON(AUDIT_PATH, auditReport, true);
console.log(`완료: 독립 에피소드 ${scores.coverage.independentEpisodes}, 3개월/1년 소스 ${scores.sources.length}명, 실패 ${failed}건`);
