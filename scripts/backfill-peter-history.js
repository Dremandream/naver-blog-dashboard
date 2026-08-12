/**
 * Peter K 시장 관점 장기 이력 백필.
 *
 * 기본 동작: 최근 2년을 수집하고 시장 관점 글이 60개 미만일 때만 3년으로 확장한다.
 * 공개 목록·본문은 무료로 수집하고, 시장 키워드 후보만 기존 Claude 분석기로 판정한다.
 * 실행: node scripts/backfill-peter-history.js
 * 감사: node scripts/backfill-peter-history.js --audit
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { analyzePost } from './collect-rss.js';
import { buildPeterBacktest, buildPeterFearGreed, mergePeterHistory } from '../shared/peter-fear-greed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POSTS_PATH = path.join(__dirname, '../public/data/posts.json');
const MARKET_HISTORY_PATH = path.join(__dirname, '../public/data/history.json');
const PETER_HISTORY_PATH = path.join(__dirname, '../public/data/peter-history.json');
const CACHE_PATH = path.join(__dirname, '../node_modules/.cache/peter-history.json');
const AUDIT_ONLY = process.argv.includes('--audit');
const ANALYZE_ALL = process.argv.includes('--all');
const MIN_MARKET_POSTS = 60;
const BLOG_ID = 'luy1978';
const MARKET_CANDIDATE = /시장|증시|코스피|코스닥|지수|주도주|수급|유동성|랠리|상승장|하락장|강세장|약세장|조정장|고점|저점|바닥|폭락|급락|투매|공포|탐욕|버블|과열|반등|추세|순매수|외국인|기관|신용|예탁금|금리|환율|매크로|경기침체|각자도생|조심/;

const kstDate = offset => new Date(Date.now() - offset * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const cutoffForYears = years => {
  const now = new Date(`${kstDate(0)}T00:00:00+09:00`);
  now.setFullYear(now.getFullYear() - years);
  return now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
};

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://blog.naver.com/' } }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve(data)
        : reject(new Error(`HTTP ${response.statusCode}`)));
    }).on('error', reject);
  });
}

function parseDate(value) {
  const absolute = String(value).match(/(20\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (absolute) return `${absolute[1]}-${absolute[2].padStart(2, '0')}-${absolute[3].padStart(2, '0')}`;
  if (/어제/.test(value)) return kstDate(1);
  if (/\d+시간 전|\d+분 전|방금/.test(value)) return kstDate(0);
  return null;
}

function decodeTitle(value) {
  const unescaped = value.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  try { return decodeURIComponent(unescaped.replace(/\+/g, ' ')); } catch { return unescaped; }
}

function parseList(raw) {
  const rows = [];
  const pattern = /"logNo":"(\d+)"[\s\S]*?"title":"((?:\\.|[^"])*)"[\s\S]*?"addDate":"([^"]*)"/g;
  for (const match of raw.matchAll(pattern)) {
    const date = parseDate(match[3]);
    if (date) rows.push({ logNo: match[1], title: decodeTitle(match[2]), date });
  }
  return rows;
}

function extractBody(html) {
  const paragraphs = [...html.matchAll(/class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
    .map(match => match[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#8203;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (paragraphs.length) return paragraphs.join(' ');
  const legacy = html.match(/id="postViewArea"[^>]*>([\s\S]*?)<\/div>/);
  return legacy ? legacy[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

async function listPosts(cutoff) {
  const items = [];
  for (let page = 1; page <= 170; page++) {
    const raw = await get(`https://blog.naver.com/PostTitleListAsync.naver?blogId=${BLOG_ID}&currentPage=${page}&countPerPage=30&categoryNo=0`);
    const rows = parseList(raw);
    if (!rows.length) break;
    let reachedCutoff = false;
    for (const row of rows) {
      if (row.date < cutoff) { reachedCutoff = true; continue; }
      items.push(row);
    }
    if (reachedCutoff) break;
    if (page % 20 === 0) console.log(`  목록 ${page}페이지 · ${items.length}개`);
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  return items;
}

async function pool(items, size, worker) {
  let cursor = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  }));
}

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/\x00/g, '').trim()); } catch { return fallback; }
}

async function collectRange(years, cache) {
  const cutoff = cutoffForYears(years);
  console.log(`\n📜 피터케이 최근 ${years}년 목록 수집 (${cutoff}~)`);
  const items = await listPosts(cutoff);
  const missing = items.filter(item => !cache[item.logNo] || (ANALYZE_ALL && cache[item.logNo].deterministic));
  console.log(`  글 ${items.length}개 · 캐시 ${items.length - missing.length}개 · 신규 확인 ${missing.length}개`);
  if (AUDIT_ONLY) return { cutoff, items, cache };

  let completed = 0;
  await pool(missing, 5, async item => {
    try {
      const html = await get(`https://m.blog.naver.com/PostView.naver?blogId=${BLOG_ID}&logNo=${item.logNo}`);
      const body = extractBody(html);
      const candidate = ANALYZE_ALL || MARKET_CANDIDATE.test(`${item.title} ${body}`);
      if (!candidate) {
        cache[item.logNo] = { date: item.date, title: item.title, market_view: false, deterministic: true };
      } else {
        const analysis = await analyzePost(item.title, body || item.title, '피터케이');
        if (!analysis._failed) {
          cache[item.logNo] = {
            date: item.date,
            title: item.title,
            market_view: analysis.market_view === true,
            market_sentiment: analysis.market_sentiment || 0,
            market_reason: analysis.market_reason || '',
          };
        }
      }
    } catch (error) {
      console.warn(`  ⚠️ ${item.logNo} 실패: ${error.message}`);
    }
    completed++;
    if (completed % 50 === 0) {
      fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
      console.log(`  본문·분석 ${completed}/${missing.length}`);
    }
  });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
  return { cutoff, items, cache };
}

function toPosts(items, cache) {
  return items.map(item => {
    const result = cache[item.logNo];
    return {
      id: `${BLOG_ID}_${item.date}_${item.logNo}`,
      date: item.date,
      person: '피터케이',
      blog_id: BLOG_ID,
      title: item.title,
      url: `https://blog.naver.com/${BLOG_ID}/${item.logNo}`,
      market_view: result?.market_view === true,
      market_sentiment: result?.market_sentiment || 0,
      market_reason: result?.market_reason || '',
    };
  });
}

let cache = readJSON(CACHE_PATH, {});
fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
let run = await collectRange(2, cache);
if (AUDIT_ONLY) {
  console.log(JSON.stringify({ years: 2, cutoff: run.cutoff, posts: run.items.length, cached: run.items.filter(item => cache[item.logNo]).length }, null, 2));
  process.exit(0);
}

let existing = readJSON(PETER_HISTORY_PATH, []);
let peterHistory = mergePeterHistory(existing, toPosts(run.items, cache));
const recentTwoYearCount = peterHistory.filter(item => item.date >= run.cutoff).length;
if (recentTwoYearCount < MIN_MARKET_POSTS) {
  console.log(`\n↪️ 2년 시장 관점 ${recentTwoYearCount}개 < ${MIN_MARKET_POSTS}개: 3년으로 확장`);
  run = await collectRange(3, cache);
  peterHistory = mergePeterHistory(peterHistory, toPosts(run.items, cache));
} else {
  console.log(`\n✅ 2년 시장 관점 ${recentTwoYearCount}개: 3년 확장 불필요`);
}

const marketHistory = readJSON(MARKET_HISTORY_PATH, {});
const postsData = readJSON(POSTS_PATH, {});
const referenceDate = postsData.date || kstDate(0);
const current = buildPeterFearGreed(peterHistory, { referenceDate });
current.history = {
  start: peterHistory[0]?.date || null,
  end: peterHistory.at(-1)?.date || null,
  posts: peterHistory.length,
  yearsRequested: recentTwoYearCount >= MIN_MARKET_POSTS ? 2 : 3,
};
current.backtest = buildPeterBacktest(peterHistory, marketHistory);

fs.writeFileSync(PETER_HISTORY_PATH, JSON.stringify(peterHistory, null, 2), 'utf8');
postsData.peter_fear_greed = current;
fs.writeFileSync(POSTS_PATH, JSON.stringify(postsData, null, 2), 'utf8');
console.log(`\n✅ Peter K 이력 ${peterHistory.length}개 (${current.history.start}~${current.history.end})`);
console.log(`📊 극단 공포 ${current.backtest.fear.events}회 · 극단 탐욕 ${current.backtest.greed.events}회 · 판정 가능 ${current.backtest.judgedEvents}회`);
