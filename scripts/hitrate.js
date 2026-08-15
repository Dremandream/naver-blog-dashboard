/**
 * 소스 적중률 계산. AI를 호출하지 않는 결정적 로직이다.
 *
 * - 강세/약세 의견의 종목 수익률을 시장 벤치마크와 비교한다.
 * - KR은 KOSPI, US는 NASDAQ을 사용한다.
 * - T+N은 달력 칸 수가 아니라 해당 시장 벤치마크의 실제 N번째 거래일이다.
 * - 같은 인물·종목·방향의 연속 언급은 하나의 독립 에피소드로 계산한다.
 * - 글 분석 버전과 적중률 이력 버전을 분리해 프롬프트 변경으로 과거 표본이 사라지지 않게 한다.
 */

const DEFAULT_WINDOWS = [63, 252];
const MIN_SAMPLE = 20;
export const HITRATE_SCHEMA_VERSION = 1;
export const EPISODE_GAP_DAYS = 7;
const CURRENT_ANALYSIS_SCHEMA_VERSION = 3;
const BENCH = { KR: 'KOSPI', US: 'NASDAQ' };
const LABELS = { 5: '5일', 20: '20일', 21: '1개월', 63: '3개월', 252: '1년' };
const labelOf = (n) => LABELS[n] || `${n}거래일`;
const ret = (a, b) => (a && b ? (b - a) / a : null);
const dayNumber = (date) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);

export function isHitrateOpinion(opinion) {
  if (opinion?.source_role !== 'opinion') return false;
  return opinion.hitrate_version === HITRATE_SCHEMA_VERSION ||
    opinion.analysis_version === CURRENT_ANALYSIS_SCHEMA_VERSION;
}

function buildTradingCalendars(history, dates) {
  const calendars = {};
  for (const [market, benchmark] of Object.entries(BENCH)) {
    const tradingDates = dates.filter((date) => Number.isFinite(history[date]?.indices?.[benchmark]));
    calendars[market] = tradingDates;
  }
  return calendars;
}

function firstTradingDateAfter(tradingDates, date) {
  let low = 0;
  let high = tradingDates.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (tradingDates[mid] <= date) low = mid + 1;
    else high = mid;
  }
  return low < tradingDates.length ? low : null;
}

function independentEpisodes(history, dates) {
  const episodes = [];
  const active = new Map();
  let eligibleMentions = 0;
  let repeatedMentions = 0;

  for (const date of dates) {
    for (const op of history[date]?.opinions || []) {
      if (!isHitrateOpinion(op) || !['강세', '약세'].includes(op.stance) || !BENCH[op.market]) continue;
      eligibleMentions++;
      const key = `${op.person}|${op.stock}|${op.market}`;
      const previous = active.get(key);
      const gap = previous ? dayNumber(date) - dayNumber(previous.lastSeen) : Infinity;
      const sameEpisode = previous && previous.stance === op.stance && gap <= EPISODE_GAP_DAYS;
      if (sameEpisode) {
        previous.lastSeen = date;
        repeatedMentions++;
        continue;
      }
      const episode = { ...op, date, lastSeen: date };
      episodes.push(episode);
      active.set(key, episode);
    }
  }
  return { episodes, eligibleMentions, repeatedMentions };
}

export function computeSourceScores(history, windows = DEFAULT_WINDOWS, minSample = MIN_SAMPLE) {
  const dates = Object.keys(history || {}).sort();
  const calendars = buildTradingCalendars(history, dates);
  const episodeData = independentEpisodes(history, dates);
  const acc = {};
  const bump = (person) => {
    if (!acc[person]) {
      const w = {};
      for (const N of windows) w[N] = { hits: 0, total: 0 };
      acc[person] = { w, opinions: 0 };
    }
    return acc[person];
  };

  for (const op of episodeData.episodes) {
    const bench = BENCH[op.market];
    const startIndex = firstTradingDateAfter(calendars[op.market], op.date);
    const source = bump(op.person);
    source.opinions++;
    if (startIndex == null) continue;
    const startDate = calendars[op.market][startIndex];
    const recStart = history[startDate];
    const p0 = recStart?.prices?.[op.stock];
    const i0 = recStart?.indices?.[bench];
    if (!p0 || !i0) continue;

    for (const N of windows) {
      const endDate = calendars[op.market][startIndex + N - 1];
      if (!endDate) continue;
      const recEnd = history[endDate];
      const p1 = recEnd?.prices?.[op.stock];
      const i1 = recEnd?.indices?.[bench];
      if (!p1 || !i1) continue;
      const excess = ret(p0, p1) - ret(i0, i1);
      const hit = op.stance === '강세' ? excess > 0 : excess < 0;
      source.w[N].total++;
      if (hit) source.w[N].hits++;
    }
  }

  const rate = (w) => (w.total >= minSample ? Math.round((w.hits / w.total) * 1000) / 10 : null);
  const first = windows[0];
  const last = windows[windows.length - 1];
  const sources = Object.entries(acc).map(([person, source]) => {
    const w = {};
    for (const N of windows) w[N] = { ...source.w[N], rate: rate(source.w[N]) };
    return { person, opinions: source.opinions, w };
  }).sort((x, y) =>
    (y.w[last].rate ?? -1) - (x.w[last].rate ?? -1) ||
    (y.w[first].rate ?? -1) - (x.w[first].rate ?? -1) ||
    y.w[last].total - x.w[last].total);

  return {
    asOf: dates.at(-1) || null,
    schemaVersion: HITRATE_SCHEMA_VERSION,
    methodology: 'next-trading-day-market-relative-independent-episodes',
    episodeGapDays: EPISODE_GAP_DAYS,
    minSample,
    windows: windows.map((n) => ({ n, label: labelOf(n) })),
    coverage: {
      historyStart: dates[0] || null,
      historyEnd: dates.at(-1) || null,
      eligibleMentions: episodeData.eligibleMentions,
      independentEpisodes: episodeData.episodes.length,
      repeatedMentionsExcluded: episodeData.repeatedMentions,
    },
    sources,
  };
}
