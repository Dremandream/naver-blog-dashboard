const DATE8 = /^\d{8}$/;

function date8ToDash(value) {
  const s = String(value ?? '');
  if (!DATE8.test(s)) throw new Error(`잘못된 기준일: ${s || '없음'}`);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function kstDate8(now) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get('year')}${get('month')}${get('day')}`;
}

function assertFresh(asOf, now, staleAfterDays = 8) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('현재 시각이 올바르지 않습니다');
  const today = kstDate8(now);
  const asOfMs = Date.UTC(Number(asOf.slice(0, 4)), Number(asOf.slice(4, 6)) - 1, Number(asOf.slice(6, 8)));
  const todayMs = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(4, 6)) - 1, Number(today.slice(6, 8)));
  const ageDays = Math.floor((todayMs - asOfMs) / 86400000);
  if (ageDays < 0) throw new Error(`미래 기준일: ${asOf}`);
  if (ageDays >= staleAfterDays) throw new Error(`지연 데이터: ${asOf} (${ageDays}일 전)`);
}

export function parseAikStockHistory(payload, {
  expectedCode,
  minDate = null,
  now = new Date(),
  staleAfterDays = 8,
} = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('종목 이력 JSON이 없습니다');
  if (!/^\d{6}$/.test(expectedCode ?? '') || payload.code !== expectedCode) {
    throw new Error(`종목코드 불일치: ${payload.code ?? '없음'} / ${expectedCode ?? '없음'}`);
  }
  const asOf = String(payload.as_of ?? '');
  date8ToDash(asOf);
  assertFresh(asOf, now, staleAfterDays);

  const columns = payload.columns;
  const dateIndex = Array.isArray(columns) ? columns.indexOf('date') : -1;
  const closeIndex = Array.isArray(columns) ? columns.indexOf('close') : -1;
  if (dateIndex < 0 || closeIndex < 0 || !Array.isArray(payload.rows) || payload.rows.length === 0) {
    throw new Error('종목 이력 스키마가 올바르지 않습니다');
  }

  const rows = payload.rows.map((row) => {
    const date = String(row?.[dateIndex] ?? '');
    const close = Number(row?.[closeIndex]);
    if (!DATE8.test(date) || !Number.isFinite(close) || close <= 0) {
      throw new Error('종목 이력에 잘못된 날짜 또는 종가가 있습니다');
    }
    return { date: date8ToDash(date), close };
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (rows.at(-1)?.date !== date8ToDash(asOf)) throw new Error('기준일과 마지막 거래일이 다릅니다');
  const filtered = minDate ? rows.filter((row) => row.date >= minDate) : rows;
  if (filtered.length === 0) throw new Error('요청 기간에 종가가 없습니다');
  return filtered;
}

export function parseAikIndexSnapshot(payload, symbol, now = new Date(), staleAfterDays = 8) {
  if (!payload || typeof payload !== 'object') throw new Error('시장 요약 JSON이 없습니다');
  const asOf = String(payload.quote_as_of ?? payload.as_of ?? '');
  date8ToDash(asOf);
  assertFresh(asOf, now, staleAfterDays);

  const labels = symbol === 'KOSPI' ? ['코스피', 'KOSPI'] : symbol === 'KOSDAQ' ? ['코스닥', 'KOSDAQ'] : [];
  const item = Object.values(payload.market_index ?? {}).find((value) =>
    labels.includes(value?.name) || labels.includes(value?.name_en));
  const close = Number(item?.close);
  const d1 = Number(item?.change_pct);
  if (!item || item.change_pct == null || !Number.isFinite(close) || close <= 0 || !Number.isFinite(d1)) {
    throw new Error(`${symbol} 최신값이 올바르지 않습니다`);
  }
  if (String(item.as_of ?? asOf) !== asOf) throw new Error(`${symbol} 기준일이 시장 요약과 다릅니다`);
  return { date: date8ToDash(asOf), close, d1 };
}

export function mergeIndexSnapshot(closes, snapshot) {
  const byDate = new Map((closes ?? []).map((row) => [row.date, { date: row.date, close: row.close }]));
  const latestExisting = [...byDate.keys()].sort().at(-1);
  if (latestExisting && snapshot.date < latestExisting) {
    throw new Error(`공개 지수 기준일이 기존 이력보다 오래됐습니다: ${snapshot.date} < ${latestExisting}`);
  }
  byDate.set(snapshot.date, { date: snapshot.date, close: snapshot.close });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
