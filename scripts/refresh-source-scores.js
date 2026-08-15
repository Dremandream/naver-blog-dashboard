/** 공식 소스 의견에 필요한 종가·지수를 갱신하고 적중률을 다시 계산한다. AI 호출 없음. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  resolveStockCode, fetchClosesDated, fetchIndexClosesDated, fetchForeignIndexClosesDated,
} from './collect-rss.js';
import { computeSourceScores, isHitrateOpinion } from './hitrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'public/data/history.json');
const POSTS_PATH = path.join(ROOT, 'public/data/posts.json');
const CODES_PATH = path.join(ROOT, 'config/stock-codes.json');
const DAYS = 800;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const read = (file, fallback = {}) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const write = (file, value, pretty = false) => fs.writeFileSync(file, JSON.stringify(value, null, pretty ? 2 : 0), 'utf8');

const history = read(HISTORY_PATH);
const posts = read(POSTS_PATH);
const codes = read(CODES_PATH);
const stocks = [...new Set(Object.values(history).flatMap((record) =>
  (record.opinions || []).filter(isHitrateOpinion).map((opinion) => opinion.stock),
))];

const indices = {};
const addIndex = (label, rows) => rows.forEach((row) => (indices[row.date] ||= {})[label] = row.close);
addIndex('KOSPI', await fetchIndexClosesDated('KOSPI', DAYS));
addIndex('KOSDAQ', await fetchIndexClosesDated('KOSDAQ', DAYS));
addIndex('NASDAQ', await fetchForeignIndexClosesDated('.IXIC', DAYS));
addIndex('SP500', await fetchForeignIndexClosesDated('.INX', DAYS));

const prices = {};
const failures = [];
for (let index = 0; index < stocks.length; index++) {
  const stock = stocks[index];
  try {
    const info = await resolveStockCode(stock, codes);
    if (!info) throw new Error('종목코드 미확인');
    const rows = await fetchClosesDated(info, DAYS);
    rows.forEach((row) => (prices[row.date] ||= {})[stock] = row.close);
  } catch (error) { failures.push({ stock, reason: error.message }); }
  if ((index + 1) % 25 === 0) console.log(`시세 ${index + 1}/${stocks.length}`);
  await sleep(180);
}

for (const date of new Set([...Object.keys(indices), ...Object.keys(prices)])) {
  const previous = history[date] || {};
  history[date] = {
    prices: { ...(previous.prices || {}), ...(prices[date] || {}) },
    indices: { ...(previous.indices || {}), ...(indices[date] || {}) },
    opinions: previous.opinions || [],
  };
}
const cutoff = new Date();
cutoff.setUTCDate(cutoff.getUTCDate() - DAYS);
const cutoffDate = cutoff.toISOString().slice(0, 10);
const pruned = Object.fromEntries(Object.keys(history).sort().filter((date) => date >= cutoffDate).map((date) => [date, history[date]]));
const scores = computeSourceScores(pruned);
scores.refresh = { generatedAt: new Date().toISOString(), stocks: stocks.length, failures };
posts.source_scores = scores;
write(HISTORY_PATH, pruned);
write(POSTS_PATH, posts, true);
write(CODES_PATH, codes, true);
console.log(`적중률 갱신 완료: ${stocks.length - failures.length}/${stocks.length}종목, 실패 ${failures.length}`);
if (stocks.length && failures.length / stocks.length > 0.1) process.exitCode = 1;
