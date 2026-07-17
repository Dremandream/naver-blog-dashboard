/**
 * 소스 적중률 소급 백필 (1회성)
 * 실행: node scripts/backfill-history.js
 *
 * posts.json은 8일치만 롤링 저장되지만, GitHub Actions가 매일 커밋해 온 git 이력에는
 * 과거 스냅샷이 남아 있다. 각 커밋의 posts.json에서 (날짜·인물·종목·stance) 의견을 복원하고,
 * 과거 종가·지수를 시세 API로 받아 public/data/history.json에 병합 → 적중률을 소급 계산한다.
 *
 * 주의: 방향성(강세/약세) stance는 분석기가 2026-07-06부터 추출 → 그 전 의견은 전부 중립(집계 제외).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import {
  resolveStockCode, fetchClosesDated, fetchIndexClosesDated, fetchForeignIndexClosesDated, analyzePost,
} from './collect-rss.js';
import { computeSourceScores } from './hitrate.js';

const FROM = '2026-06-17';        // 백필 시작일
const STANCE_CUTOFF = '2026-07-06'; // 이 날짜부터는 원본에 stance 있음 → 재분석 불필요
async function pool(items, size, fn) { // 동시 실행 제한
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  }));
  return out;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, '../public/data/history.json');
const POSTS_PATH = path.join(__dirname, '../public/data/posts.json');
const CODES_PATH = path.join(__dirname, '../config/stock-codes.json');
const rank = (s) => (s === '강세' ? 2 : s === '약세' ? 2 : 1);

// person 정규화: 옛 스냅샷이 id/name/다른 표기로 저장한 걸 config 기준 정식 person으로 통일
// (예: luy1978·피터케이 → 피터케이, 잠실개미(텔레)·jake8lee → 잠실개미)
const personMap = {};
for (const f of ['../config/blogs.json', '../config/telegram-channels.json']) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    for (const s of cfg.blogs || cfg.channels || []) {
      for (const key of [s.id, s.name, s.person]) if (key) personMap[key] = s.person;
    }
  } catch {}
}
const canonPerson = (p) => personMap[p] || p;

// 1) git 이력에서 글 복원 (id별 최신 스냅샷). 07-06+ 글엔 stance 있음, 그 전은 없음.
console.log('📜 git 이력에서 과거 글 복원 중...');
const hashes = execSync('git log --format=%H -- public/data/posts.json', { encoding: 'utf8', maxBuffer: 1e8 }).trim().split('\n');
const seen = {}; // id -> post
for (const h of hashes) {
  let json;
  try { json = JSON.parse(execSync(`git show ${h}:public/data/posts.json`, { encoding: 'utf8', maxBuffer: 1e8 })); }
  catch { continue; }
  for (const p of json.posts || []) {
    if (!p.date || p.date < FROM) continue;
    const id = p.id || `${p.person || p.blog_name}|${p.date}|${p.title}`;
    const cur = seen[id];
    // stance 있는 버전을 우선 보존 (07-06+ 스냅샷)
    if (!cur || ((p.stance === '강세' || p.stance === '약세') && !(cur.stance === '강세' || cur.stance === '약세'))) seen[id] = p;
  }
}
const allPosts = Object.values(seen);
console.log(`  글 ${allPosts.length}개 복원 (${FROM}~)`);

// 2) stance 없는 과거 글(07-06 이전) 재분석 → stocks + stance 재추출 (Haiku)
// 캐시(id→{stocks,stance})로 재실행 시 API 재호출 없이 즉시 재사용 (속도)
const CACHE_PATH = path.join(__dirname, '.backfill-cache.json');
let reCache = {};
try { reCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8')); } catch {}
const toReanalyze = allPosts.filter(p => p.date < STANCE_CUTOFF && !(p.stance === '강세' || p.stance === '약세'));
const idOf = (p) => p.id || `${p.person || p.blog_name}|${p.date}|${p.title}`;
const missing = toReanalyze.filter(p => !reCache[idOf(p)]);
console.log(`🤖 재분석 대상 ${toReanalyze.length}개 (캐시 ${toReanalyze.length - missing.length} / 신규 ${missing.length})...`);
let done = 0;
await pool(missing, 5, async (p) => {
  const content = [p.summary, ...(p.key_points || [])].filter(Boolean).join('\n') || p.title;
  const r = await analyzePost(p.title, content, p.person || p.blog_name);
  reCache[idOf(p)] = { stocks: r.stocks, stance: r.stance };
  if (++done % 25 === 0) console.log(`  ...${done}/${missing.length}`);
});
fs.writeFileSync(CACHE_PATH, JSON.stringify(reCache), 'utf-8');
for (const p of toReanalyze) { const c = reCache[idOf(p)]; if (c) { p.stocks = c.stocks; p.stance = c.stance; } }
console.log(`  재분석 완료 (신규 ${done})`);

// 3) 글 → 날짜별 의견 (person+stock별 최강 stance)
const opByDate = {}; // date -> 'person|stock' -> {person, stock, stance}
for (const p of allPosts) {
  const person = canonPerson(p.person || p.blog_name); if (!person) continue;
  const stance = p.stance === '강세' ? '강세' : p.stance === '약세' ? '약세' : '중립';
  for (const stock of p.stocks || []) {
    const m = opByDate[p.date] = opByDate[p.date] || {};
    const k = `${person}|${stock}`;
    if (!m[k] || rank(stance) > rank(m[k].stance)) m[k] = { person, stock, stance };
  }
}
const dates = Object.keys(opByDate).sort();
console.log(`  ${dates.length}일 (${dates[0]}~${dates[dates.length - 1]}) 의견 구성`);

// 2) 방향성 의견에 등장한 종목만 시세 대상 (중립-only는 스킵)
const dirStocks = new Set();
for (const d of dates) for (const o of Object.values(opByDate[d])) if (o.stance !== '중립') dirStocks.add(o.stock);
console.log(`  방향성 종목 ${dirStocks.size}개 시세 수집 시작`);

// 3) 종목별 날짜별 종가
let cache = {};
try { cache = JSON.parse(fs.readFileSync(CODES_PATH, 'utf8')); } catch {}
const priceByDate = {}; // date -> stock -> close
const marketOf = {};
let ok = 0, skip = 0;
for (const name of dirStocks) {
  try {
    const info = await resolveStockCode(name, cache);
    if (!info) { skip++; continue; }
    marketOf[name] = info.market;
    const closesD = await fetchClosesDated(info);
    for (const c of closesD) (priceByDate[c.date] = priceByDate[c.date] || {})[name] = c.close;
    ok++;
    await new Promise((r) => setTimeout(r, 250));
  } catch (e) { skip++; }
}
fs.writeFileSync(CODES_PATH, JSON.stringify(cache, null, 2), 'utf-8');
console.log(`  종가 수집: 성공 ${ok} / 스킵 ${skip}`);

// 4) 지수 (KR: KOSPI/KOSDAQ, US: 나스닥/S&P500)
console.log('📈 지수 수집 중...');
const indexByDate = {};
const addIdx = (label, arr) => { for (const c of arr) (indexByDate[c.date] = indexByDate[c.date] || {})[label] = c.close; };
try { addIdx('KOSPI', await fetchIndexClosesDated('KOSPI')); } catch (e) { console.warn('KOSPI 실패', e.message); }
try { addIdx('KOSDAQ', await fetchIndexClosesDated('KOSDAQ')); } catch (e) { console.warn('KOSDAQ 실패', e.message); }
try { addIdx('NASDAQ', await fetchForeignIndexClosesDated('.IXIC')); } catch (e) { console.warn('나스닥 실패', e.message); }
try { addIdx('SP500', await fetchForeignIndexClosesDated('.INX')); } catch (e) { console.warn('S&P 실패', e.message); }

// 5) history.json 병합 (기존 레코드 보존)
let history = {};
try { history = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')); } catch {}
// 거래일 축을 빠짐없이: KOSPI 거래일 + 의견일 합집합 (N거래일 뒤 계산 정확도)
const tradingDays = Object.keys(indexByDate).filter((d) => indexByDate[d]?.KOSPI != null && d >= FROM);
const allDates = [...new Set([...dates, ...tradingDays])].sort();
let filled = 0;
for (const date of allDates) {
  const prev = history[date] || {};
  const ops = {};
  for (const o of prev.opinions || []) { const cp = canonPerson(o.person); ops[`${cp}|${o.stock}`] = { ...o, person: cp }; }
  for (const o of Object.values(opByDate[date] || {})) {
    if (!priceByDate[date]?.[o.stock]) continue; // 그날 종가 없으면 판정 불가
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
// 최근 120일치 유지
const keep = Object.keys(history).sort().reverse().slice(0, 120).sort();
const pruned = {};
for (const d of keep) pruned[d] = history[d];
fs.writeFileSync(HISTORY_PATH, JSON.stringify(pruned, null, 2), 'utf-8');
console.log(`📚 history 병합: ${Object.keys(pruned).length}일치 (갱신 ${filled}일)`);

// 6) 적중률 재계산 → posts.json에 반영
const scores = computeSourceScores(pruned);
const posts = JSON.parse(fs.readFileSync(POSTS_PATH, 'utf-8'));
posts.source_scores = scores;
fs.writeFileSync(POSTS_PATH, JSON.stringify(posts, null, 2), 'utf-8');
const judged = scores.sources.filter((s) => s.w5.total > 0);
console.log(`🎯 적중률 재계산: ${scores.sources.length}명 중 5일 판정 있는 소스 ${judged.length}명`);
for (const s of judged.slice(0, 20)) {
  console.log(`  ${s.person}: 5일 ${s.w5.rate ?? '표본부족'}${s.w5.rate != null ? '%' : ''} (${s.w5.hits}/${s.w5.total}) · 20일 ${s.w20.rate ?? '—'}${s.w20.rate != null ? '%' : ''} (${s.w20.hits}/${s.w20.total})`);
}
