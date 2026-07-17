/**
 * 과거 텔레그램 메시지 스크레이핑 백필 (1회성) — 소스 적중률 표본 확대
 * 실행: node scripts/scrape-telegram-history.js [YYYY-MM-DD]  (기본 3개월 전)
 *
 * t.me/s/{채널}?before={msgId} 로 과거 페이지를 역순으로 넘기며 cutoff까지 수집,
 * 채널×일자로 메시지를 묶어 Haiku 재분석(stocks·stance) → history.json 병합 → 적중률 재계산.
 * 캐시 키 = 채널|날짜 (.tg-scrape-cache.json). 블로그판(scrape-history.js)과 동일 구조.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { parseTelegramMessages, analyzePost, resolveStockCode, fetchClosesDated, fetchIndexClosesDated, fetchForeignIndexClosesDated } from './collect-rss.js';
import { computeSourceScores } from './hitrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, '../public/data/history.json');
const POSTS_PATH = path.join(__dirname, '../public/data/posts.json');
const CODES_PATH = path.join(__dirname, '../config/stock-codes.json');
const CACHE_PATH = path.join(__dirname, '.tg-scrape-cache.json');
const CUTOFF = process.argv[2] || (() => new Date(Date.now() - 92 * 86400000).toISOString().slice(0, 10))();
const PRICE_DAYS = 110;
const MAX_PAGES = 80;
const rank = (s) => (s === '강세' ? 2 : s === '약세' ? 2 : 1);

const personMap = {};
const channels = [];
for (const f of ['../config/blogs.json', '../config/telegram-channels.json']) {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  for (const s of cfg.blogs || cfg.channels || []) {
    for (const key of [s.id, s.name, s.person]) if (key) personMap[key] = s.person;
    if (cfg.channels) channels.push(s);
  }
}
const canonPerson = (p) => personMap[p] || p;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}
async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } }));
  return out;
}

// 1) 채널별 과거 메시지 수집 (before= 페이지네이션, cutoff까지)
console.log(`📱 텔레그램 과거 메시지 수집 (cutoff ${CUTOFF})...`);
const byChannelDate = {}; // 'channelId|date' -> {person, channelId, texts:[]}
for (const ch of channels) {
  let before = '', pages = 0, oldest = '9999', collected = 0;
  const seen = new Set();
  while (pages < MAX_PAGES) {
    let html;
    try { html = await get(`https://t.me/s/${ch.id}${before ? '?before=' + before : ''}`); }
    catch { break; }
    const ids = [...html.matchAll(new RegExp(`data-post="${ch.id}\\/(\\d+)"`, 'g'))].map((m) => +m[1]);
    if (ids.length === 0) break;
    const msgs = parseTelegramMessages(html, ch.id);
    for (const m of msgs) {
      if (seen.has(m.url)) continue;
      seen.add(m.url);
      if (m.postDate < CUTOFF) { oldest = m.postDate; continue; }
      const key = `${ch.id}|${m.postDate}`;
      (byChannelDate[key] = byChannelDate[key] || { person: ch.person || ch.name, channelId: ch.id, date: m.postDate, texts: [] }).texts.push(m.text);
      collected++;
    }
    const minId = Math.min(...ids);
    oldest = Math.min(oldest, ...msgs.map((m) => m.postDate).filter(Boolean).map((d) => d)); // 문자열 최소
    if (msgs.some((m) => m.postDate < CUTOFF)) break; // cutoff 도달
    before = minId; pages++;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`  ${ch.name}: ${collected}건 (${pages + 1}페이지)`);
}

// 2) 채널×일자 그룹 분석 (캐시)
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
const groups = Object.entries(byChannelDate).map(([key, g]) => ({ key, ...g }));
const missing = groups.filter((g) => !cache[g.key]);
console.log(`🤖 분석 ${groups.length}개 채널·일자 그룹 (캐시 ${groups.length - missing.length} / 신규 ${missing.length})...`);
let done = 0;
await pool(missing, 5, async (g) => {
  const content = g.texts.join('\n\n---\n\n').slice(0, 8000);
  try {
    const r = await analyzePost(`${g.person} 텔레그램 (${g.date})`, content, g.person);
    cache[g.key] = { stocks: r.stocks, stance: r.stance };
  } catch { cache[g.key] = { stocks: [], stance: '중립' }; }
  if (++done % 25 === 0) { console.log(`  ...${done}/${missing.length}`); fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); }
});
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
console.log(`  분석 완료 (신규 ${done})`);

// 3) 날짜별 의견
const opByDate = {};
for (const g of groups) {
  const c = cache[g.key]; if (!c) continue;
  const person = canonPerson(g.person);
  const stance = c.stance === '강세' ? '강세' : c.stance === '약세' ? '약세' : '중립';
  for (const stock of c.stocks || []) {
    const m = opByDate[g.date] = opByDate[g.date] || {};
    const k = `${person}|${stock}`;
    if (!m[k] || rank(stance) > rank(m[k].stance)) m[k] = { person, stock, stance };
  }
}
const dates = Object.keys(opByDate).sort();
console.log(`  ${dates.length}일 의견 구성 (${dates[0]}~${dates[dates.length - 1]})`);

// 4) 시세
const dirStocks = new Set();
for (const d of dates) for (const o of Object.values(opByDate[d])) if (o.stance !== '중립') dirStocks.add(o.stock);
console.log(`📈 방향성 종목 ${dirStocks.size}개 시세 수집...`);
let codes = {};
try { codes = JSON.parse(fs.readFileSync(CODES_PATH, 'utf8')); } catch {}
const priceByDate = {}; const marketOf = {}; let okc = 0;
for (const name of dirStocks) {
  try {
    const info = await resolveStockCode(name, codes);
    if (!info) continue;
    marketOf[name] = info.market;
    for (const c of await fetchClosesDated(info, PRICE_DAYS)) (priceByDate[c.date] = priceByDate[c.date] || {})[name] = c.close;
    okc++;
    await new Promise((r) => setTimeout(r, 200));
  } catch {}
}
fs.writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2), 'utf-8');
console.log(`  종가 수집 ${okc}종목`);

const indexByDate = {};
const addIdx = (label, arr) => { for (const c of arr) (indexByDate[c.date] = indexByDate[c.date] || {})[label] = c.close; };
try { addIdx('KOSPI', await fetchIndexClosesDated('KOSPI', PRICE_DAYS)); } catch {}
try { addIdx('KOSDAQ', await fetchIndexClosesDated('KOSDAQ', PRICE_DAYS)); } catch {}
try { addIdx('NASDAQ', await fetchForeignIndexClosesDated('.IXIC', PRICE_DAYS)); } catch {}
try { addIdx('SP500', await fetchForeignIndexClosesDated('.INX', PRICE_DAYS)); } catch {}

// 5) history 병합
let history = {};
try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')); } catch {}
const tradingDays = Object.keys(indexByDate).filter((d) => indexByDate[d]?.KOSPI != null && d >= CUTOFF);
const allDates = [...new Set([...dates, ...tradingDays, ...Object.keys(history)])].sort();
let filled = 0;
for (const date of allDates) {
  if (date < CUTOFF) continue;
  const prev = history[date] || {};
  const ops = {};
  for (const o of prev.opinions || []) { const cp = canonPerson(o.person); ops[`${cp}|${o.stock}`] = { ...o, person: cp }; }
  for (const o of Object.values(opByDate[date] || {})) {
    if (!priceByDate[date]?.[o.stock]) continue;
    const k = `${o.person}|${o.stock}`;
    const rec = { ...o, market: marketOf[o.stock] };
    if (!ops[k] || rank(rec.stance) > rank(ops[k].stance)) ops[k] = rec;
  }
  history[date] = {
    prices: { ...(prev.prices || {}), ...(priceByDate[date] || {}) },
    indices: { ...(prev.indices || {}), ...(indexByDate[date] || {}) },
    opinions: Object.values(ops),
  };
  filled++;
}
const keep = Object.keys(history).sort().reverse().slice(0, 200).sort();
const pruned = {}; for (const d of keep) pruned[d] = history[d];
fs.writeFileSync(HISTORY_PATH, JSON.stringify(pruned, null, 2), 'utf-8');
console.log(`📚 history 병합: ${Object.keys(pruned).length}일치 (갱신 ${filled}일)`);

// 6) 적중률 재계산
const scores = computeSourceScores(pruned);
const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf-8'));
posts.source_scores = scores;
fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2), 'utf-8');
const judged = scores.sources.filter((s) => s.w5.rate != null);
console.log(`🎯 적중률: ${scores.sources.length}명 중 5일 비율표시 ${judged.length}명`);
for (const s of scores.sources.filter((s) => s.w5.total > 0).slice(0, 20))
  console.log(`  ${s.person}: 5일 ${s.w5.rate ?? '표본적음'}${s.w5.rate != null ? '%' : ''} (${s.w5.hits}/${s.w5.total}) · 20일 ${s.w20.rate ?? '—'}${s.w20.rate != null ? '%' : ''} (${s.w20.hits}/${s.w20.total})`);
