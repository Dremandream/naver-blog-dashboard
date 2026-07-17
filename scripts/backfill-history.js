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
  resolveStockCode, fetchClosesDated, fetchIndexClosesDated, fetchForeignIndexClosesDated,
} from './collect-rss.js';
import { computeSourceScores } from './hitrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HISTORY_PATH = path.join(__dirname, '../public/data/history.json');
const POSTS_PATH = path.join(__dirname, '../public/data/posts.json');
const CODES_PATH = path.join(__dirname, '../config/stock-codes.json');
const rank = (s) => (s === '강세' ? 2 : s === '약세' ? 2 : 1);

// 1) git 이력에서 의견 복원 (전 커밋 union, person+stock별 최강 stance)
console.log('📜 git 이력에서 과거 의견 복원 중...');
const hashes = execSync('git log --format=%H -- public/data/posts.json', { encoding: 'utf8', maxBuffer: 1e8 }).trim().split('\n');
const opByDate = {}; // date -> 'person|stock' -> {person, stock, stance}
for (const h of hashes) {
  let json;
  try { json = JSON.parse(execSync(`git show ${h}:public/data/posts.json`, { encoding: 'utf8', maxBuffer: 1e8 })); }
  catch { continue; }
  for (const p of json.posts || []) {
    const person = p.person || p.blog_name; if (!person) continue;
    const stance = p.stance === '강세' ? '강세' : p.stance === '약세' ? '약세' : '중립';
    for (const stock of p.stocks || []) {
      const m = opByDate[p.date] = opByDate[p.date] || {};
      const k = `${person}|${stock}`;
      if (!m[k] || rank(stance) > rank(m[k].stance)) m[k] = { person, stock, stance };
    }
  }
}
const dates = Object.keys(opByDate).sort();
console.log(`  ${dates.length}일 (${dates[0]}~${dates[dates.length - 1]}) 의견 복원`);

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
let filled = 0;
for (const date of dates) {
  const prev = history[date] || {};
  const ops = {};
  for (const o of prev.opinions || []) ops[`${o.person}|${o.stock}`] = o;
  for (const o of Object.values(opByDate[date])) {
    if (!priceByDate[date]?.[o.stock]) continue; // 그날 종가 없으면 판정 불가
    const k = `${o.person}|${o.stock}`;
    const rec = { ...o, market: marketOf[o.stock] };
    if (!ops[k] || rank(rec.stance) > rank(ops[k].stance)) ops[k] = rec;
  }
  if (Object.keys(ops).length === 0 && !priceByDate[date]) continue;
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
