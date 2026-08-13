/**
 * 소스 적중률 계산 (judge.js처럼 순수 JS, AI 미사용, 결정적)
 *
 * 스펙 (plan.md §Phase 2, 창 확장 2026-07-21 사용자 확정):
 * - 적중 기준: 지수 대비 초과수익
 *     강세 의견 → (종목수익률 − 지수수익률) > 0 이면 적중
 *     약세 의견 → (종목수익률 − 지수수익률) < 0 이면 적중
 *     중립 의견은 집계 제외
 * - 평가 기간: 1개월·3개월·1년 (거래일 기준 21·63·252칸 뒤. history의 실제 거래일 리스트로 N칸 이동)
 * - 벤치마크: KR 종목 → KOSPI, US 종목 → NASDAQ
 * - T 또는 T+N의 종가/지수가 없으면 pending (집계 안 함)
 * - 표본 min 미만은 rate=null (UI에서 "표본부족" 표기, 침묵 절삭 금지)
 * - 주의: 1년(252거래일)은 history가 그만큼 쌓여야 성숙. 데이터 부족 시 전부 pending → UI가 "결과 대기"로 정직 표기.
 */

// 거래일 기준. 3개월≈63, 1년(12개월)≈252 (미국식 연 252거래일 관례)
// 2026-07-22 사용자 결정: 1개월 제거, 3개월·1년 두 창만. 3개월=근거리 신뢰 랭킹, 1년=장기 성적표(축적되며 채워짐)
const DEFAULT_WINDOWS = [63, 252];
const MIN_SAMPLE = 20; // 이 미만이면 적중률(rate) 숨김. 랭킹 신뢰용 상향(2026-07-23 5→20, n=12 우연 배제)
const ANALYSIS_SCHEMA_VERSION = 3;
const BENCH = { KR: 'KOSPI', US: 'NASDAQ' };
const LABELS = { 5: '5일', 20: '20일', 21: '1개월', 63: '3개월', 252: '1년' };
const labelOf = (n) => LABELS[n] || `${n}거래일`;

const ret = (a, b) => (a && b ? (b - a) / a : null); // a=시작가, b=종료가

/**
 * @param {Object} history  public/data/history.json 파싱 결과 { 'YYYY-MM-DD': {prices, indices, opinions} }
 * @param {number[]} [windows]  평가 거래일 창 (기본 [21,63,252])
 * @returns {Object} { asOf, minSample, windows:[{n,label}], sources:[{person, opinions, w:{ [n]:{hits,total,rate} }}] }
 */
export function computeSourceScores(history, windows = DEFAULT_WINDOWS, minSample = MIN_SAMPLE) {
  const dates = Object.keys(history || {}).sort(); // 과거→최신
  // person별 누적: acc[person] = { w:{ [N]:{hits,total} }, opinions }
  const acc = {};
  const bump = (person) => {
    if (!acc[person]) {
      const w = {};
      for (const N of windows) w[N] = { hits: 0, total: 0 };
      acc[person] = { w, opinions: 0 };
    }
    return acc[person];
  };

  for (let i = 0; i < dates.length; i++) {
    const T = dates[i];
    const recT = history[T];
    for (const op of recT.opinions || []) {
      if (op.analysis_version !== ANALYSIS_SCHEMA_VERSION || op.source_role !== 'opinion') continue;
      if (op.stance !== '강세' && op.stance !== '약세') continue; // 중립 제외
      const a = bump(op.person);
      a.opinions++;
      const bench = BENCH[op.market];
      const p0 = recT.prices?.[op.stock];
      const i0 = recT.indices?.[bench];
      for (const N of windows) {
        const Tn = dates[i + N];
        if (!Tn) continue; // 아직 N거래일 안 지남 → pending
        const recTn = history[Tn];
        const p1 = recTn.prices?.[op.stock];
        const i1 = recTn.indices?.[bench];
        if (!p0 || !p1 || !i0 || !i1) continue; // 데이터 결손 → pending
        const excess = ret(p0, p1) - ret(i0, i1);
        const hit = op.stance === '강세' ? excess > 0 : excess < 0;
        a.w[N].total++;
        if (hit) a.w[N].hits++;
      }
    }
  }

  const rate = (w) => (w.total >= minSample ? Math.round((w.hits / w.total) * 1000) / 10 : null);
  const first = windows[0];
  const last = windows[windows.length - 1]; // 가장 긴 창(1년) = 장기 신뢰성 평가 기준
  const sources = Object.entries(acc)
    .map(([person, a]) => {
      const w = {};
      for (const N of windows) w[N] = { hits: a.w[N].hits, total: a.w[N].total, rate: rate(a.w[N]) };
      return { person, opinions: a.opinions, w };
    })
    // 정렬: 최장 창(1년) 적중률(표본충족) 우선 → 그다음 최단 창(3개월) → 판정건수. 장기 표본부족(대기)은 하위로.
    .sort((x, y) =>
      (y.w[last].rate ?? -1) - (x.w[last].rate ?? -1) ||
      (y.w[first].rate ?? -1) - (x.w[first].rate ?? -1) ||
      y.w[last].total - x.w[last].total);

  return {
    asOf: dates[dates.length - 1] || null,
    minSample,
    windows: windows.map((n) => ({ n, label: labelOf(n) })),
    sources,
  };
}
