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
const PRICE_DAYS = 760; // 2년 백필+평가창 커버 (siseJson 단일 호출 ~506거래일 실측 확인)
const MAX_PAGES = 400; // 고빈도 채널을 더 과거까지 (2년 백필용, 80→400 상향)
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
    if (r._failed) return; // API 실패 → 캐시 안 함(다음 실행 재시도), 오염 방지
    cache[g.key] = { stocks: r.stocks, stance: r.stance };
  } catch { /* 재시도 소진 실패 → 캐시 안 함 */ }
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

// 지수 먼저 (종목 연타 레이트리밋 전에 벤치마크 확보 — 지수 없으면 적중 계산 불가)
const indexByDate = {};
const addIdx = (label, arr) => { for (const c of arr) (indexByDate[c.date] = indexByDate[c.date] || {})[label] = c.close; };
const idxFail = [];
for (const [label, fn] of [['KOSPI', () => fetchIndexClosesDated('KOSPI', PRICE_DAYS)], ['KOSDAQ', () => fetchIndexClosesDated('KOSDAQ', PRICE_DAYS)], ['NASDAQ', () => fetchForeignIndexClosesDated('.IXIC', PRICE_DAYS)], ['SP500', () => fetchForeignIndexClosesDated('.INX', PRICE_DAYS)]]) {
  try { addIdx(label, await fn()); } catch (e) { idxFail.push(label); }
}
const kospiDays = Object.values(indexByDate).filter((v) => v.KOSPI != null).length;
if (idxFail.length || kospiDays === 0) console.warn(`  ⚠️ 지수 수집 실패: [${idxFail.join(',')}] (KOSPI 거래일 ${kospiDays}) — 적중 계산 불가 위험! 재실행 권장`);
else console.log(`  📊 지수 수집: KOSPI ${kospiDays}거래일`);

console.log(`📈 방향성 종목 ${dirStocks.size}개 시세 수집...`);
let codes = {};
try { codes = JSON.parse(fs.readFileSync(CODES_PATH, 'utf8')); } catch {}
const priceByDate = {}; const marketOf = {}; let okc = 0, priceFail = 0, unresolved = 0, pdone = 0;
for (const name of dirStocks) {
  try {
    const info = await resolveStockCode(name, codes);
    if (info === undefined) { priceFail++; continue; }
    if (!info) { unresolved++; continue; }
    marketOf[name] = info.market;
    const closes = await fetchClosesDated(info, PRICE_DAYS);
    if (!closes.length) { priceFail++; continue; }
    for (const c of closes) (priceByDate[c.date] = priceByDate[c.date] || {})[name] = c.close;
    okc++;
    await new Promise((r) => setTimeout(r, 250));
  } catch { priceFail++; }
  if (++pdone % 200 === 0) console.log(`  ...시세 ${pdone}/${dirStocks.size} (성공 ${okc}, 실패 ${priceFail})`);
}
fs.writeFileSync(CODES_PATH, JSON.stringify(codes, null, 2), 'utf-8');
console.log(`  종가 수집 ${okc}종목 (미상장 ${unresolved}, 실패 ${priceFail})`);
if (priceFail > dirStocks.size * 0.1) console.warn(`  ⚠️ 시세 실패율 높음(${priceFail}/${dirStocks.size}) — 레이트리밋 의심, 재실행 시 캐시로 복구됨`);

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
const keep = Object.keys(history).sort().reverse().slice(0, 760).sort();
const pruned = {}; for (const d of keep) pruned[d] = history[d];
fs.writeFileSync(HISTORY_PATH, JSON.stringify(pruned), 'utf-8'); // minify (무손실 용량절감)
console.log(`📚 history 병합: ${Object.keys(pruned).length}일치 (갱신 ${filled}일)`);

// 6) 적중률 재계산
const scores = computeSourceScores(pruned);
const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf-8'));
posts.source_scores = scores;
fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2), 'utf-8');
const wins = scores.windows; // [{n,label}] — 기본 [21,63,252] = 1개월·3개월·1년
const first = wins[0].n;
const judged = scores.sources.filter((s) => s.w[first].rate != null);
console.log(`🎯 적중률: ${scores.sources.length}명 중 ${wins[0].label} 비율표시 ${judged.length}명`);
for (const s of scores.sources.filter((s) => s.w[first].total > 0).slice(0, 20)) {
  const cols = wins.map((w) => `${w.label} ${s.w[w.n].rate ?? '표본적음'}${s.w[w.n].rate != null ? '%' : ''} (${s.w[w.n].hits}/${s.w[w.n].total})`).join(' · ');
  console.log(`  ${s.person}: ${cols}`);
}
