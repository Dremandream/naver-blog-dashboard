/**
 * 과거 블로그 글 스크레이핑 백필 (1회성) — 소스 적중률 표본 확대
 * 실행: node scripts/scrape-history.js [YYYY-MM-DD]   (기본 3개월 전)
 *
 * git 이력(06-13~)으로는 최근 1개월만 복원되므로, 그 이전 구간은 네이버 블로그
 * 과거 글을 직접 긁어 stance/종목을 재분석한다.
 *  1) PostTitleListAsync 페이지네이션으로 (logNo·날짜·제목) 목록 수집 (cutoff까지)
 *  2) 모바일 PostView 본문(se-text-paragraph) 추출 → Haiku 분석(stocks·stance), logNo 캐시
 *  3) 과거 종가/지수 수집 → history.json 병합 → 적중률 재계산 → posts.json 반영
 * 텔레그램 과거는 이 스크립트 범위 밖(취약) — git 백필(06-13~)로 커버.
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { analyzePost, resolveStockCode, fetchClosesDated, fetchIndexClosesDated, fetchForeignIndexClosesDated } from './collect-rss.js';
import { computeSourceScores } from './hitrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, '../public/data/history.json');
const POSTS_PATH = path.join(__dirname, '../public/data/posts.json');
const CODES_PATH = path.join(__dirname, '../config/stock-codes.json');
const CACHE_PATH = path.join(__dirname, '.scrape-cache.json');
const CUTOFF = process.argv[2] || (() => { const d = new Date(Date.now() - 92 * 86400000); return d.toISOString().slice(0, 10); })();
const PRICE_DAYS = 760; // 시세 조회 범위(2년 백필+평가창 커버. siseJson 단일 호출로 ~506거래일 반환 실측 확인)
const rank = (s) => (s === '강세' ? 2 : s === '약세' ? 2 : 1);

// person 정규화 (config 기준)
const personMap = {};
const blogs = [];
for (const f of ['../config/blogs.json', '../config/telegram-channels.json']) {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
  for (const s of cfg.blogs || cfg.channels || []) {
    for (const key of [s.id, s.name, s.person]) if (key) personMap[key] = s.person;
    if (cfg.blogs) blogs.push(s);
  }
}
const canonPerson = (p) => personMap[p] || p;

function get(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://blog.naver.com/' } }, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(d));
    }).on('error', rej);
  });
}
async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); } }));
  return out;
}
const normDate = (s) => { const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/); return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null; };
const decodeTitle = (t) => { try { return decodeURIComponent(t.replace(/\+/g, ' ')); } catch { return t; } };
const extractBody = (html) => [...html.matchAll(/class="se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/g)]
  .map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim())
  .filter(Boolean).join(' ');

// 1) 블로그별 과거 글 목록 (cutoff까지 페이지네이션)
console.log(`📜 블로그 과거 글 목록 수집 (cutoff ${CUTOFF})...`);
const items = []; // {blogId, person, logNo, date, title}
for (const b of blogs) {
  let page = 1, stop = false;
  while (!stop && page <= 30) {
    const raw = await get(`https://blog.naver.com/PostTitleListAsync.naver?blogId=${b.id}&currentPage=${page}&countPerPage=30&categoryNo=0`);
    const entries = [...raw.matchAll(/"logNo":"(\d+)","title":"([^"]*)"[\s\S]*?"addDate":"([^"]*)"/g)];
    if (entries.length === 0) break;
    for (const [, logNo, title, addDate] of entries) {
      const date = normDate(addDate);
      if (!date) continue;
      if (date < CUTOFF) { stop = true; continue; }
      items.push({ blogId: b.id, person: b.person, logNo, date, title: decodeTitle(title) });
    }
    page++;
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`  ${b.name}: ${items.filter((i) => i.blogId === b.id).length}개`);
}
console.log(`  총 ${items.length}개 글`);

// 2) 본문 추출 + 분석 (logNo 캐시)
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
const missing = items.filter((it) => !cache[it.logNo]);
console.log(`🤖 분석 ${items.length}개 (캐시 ${items.length - missing.length} / 신규 ${missing.length})...`);
let done = 0;
await pool(missing, 5, async (it) => {
  try {
    const html = await get(`https://m.blog.naver.com/PostView.naver?blogId=${it.blogId}&logNo=${it.logNo}`);
    const body = extractBody(html);
    const r = await analyzePost(it.title, body || it.title, it.person);
    if (r._failed) return; // API 실패 → 캐시 안 함(다음 실행 재시도), 오염 방지
    cache[it.logNo] = { stocks: r.stocks, stance: r.stance };
  } catch (e) { /* 재시도 소진 실패 → 캐시 안 함 */ }
  if (++done % 25 === 0) { console.log(`  ...${done}/${missing.length}`); fs.writeFileSync(CACHE_PATH, JSON.stringify(cache)); }
});
fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');
console.log(`  분석 완료 (신규 ${done})`);

// 3) 날짜별 의견
const opByDate = {};
for (const it of items) {
  const c = cache[it.logNo]; if (!c) continue;
  const person = canonPerson(it.person);
  const stance = c.stance === '강세' ? '강세' : c.stance === '약세' ? '약세' : '중립';
  for (const stock of c.stocks || []) {
    const m = opByDate[it.date] = opByDate[it.date] || {};
    const k = `${person}|${stock}`;
    if (!m[k] || rank(stance) > rank(m[k].stance)) m[k] = { person, stock, stance };
  }
}
const dates = Object.keys(opByDate).sort();
console.log(`  ${dates.length}일 의견 구성 (${dates[0]}~${dates[dates.length - 1]})`);

// 4) 시세 (방향성 종목)
const dirStocks = new Set();
for (const d of dates) for (const o of Object.values(opByDate[d])) if (o.stance !== '중립') dirStocks.add(o.stock);

// 지수 먼저 수집 (종목 연타로 레이트리밋 걸리기 전에 벤치마크부터 확보 — 지수 없으면 적중 계산 자체가 불가)
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
    if (info === undefined) { priceFail++; continue; } // 자동완성 일시오류(재시도 소진) — 캐시 안 됨
    if (!info) { unresolved++; continue; }             // 비상장/미매칭
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

// 5) history 병합 (거래일 축 = KOSPI 거래일 ∪ 의견일, 기존 레코드 보존·person 정규화)
let history = {};
try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')); } catch {}
const tradingDays = Object.keys(indexByDate).filter((d) => indexByDate[d]?.KOSPI != null && d >= CUTOFF);
const allDates = [...new Set([...dates, ...tradingDays])].sort();
let filled = 0;
for (const date of allDates) {
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
