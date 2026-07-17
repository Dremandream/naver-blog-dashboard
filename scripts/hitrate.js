/**
 * 소스 적중률 계산 (judge.js처럼 순수 JS, AI 미사용, 결정적)
 *
 * 스펙 (plan.md §Phase 2, 2026-07-17 사용자 확정):
 * - 적중 기준: 지수 대비 초과수익
 *     강세 의견 → (종목수익률 − 지수수익률) > 0 이면 적중
 *     약세 의견 → (종목수익률 − 지수수익률) < 0 이면 적중
 *     중립 의견은 집계 제외
 * - 평가 기간: 5거래일·20거래일 (history의 실제 거래일 리스트 기준으로 N칸 뒤)
 * - 벤치마크: KR 종목 → KOSPI, US 종목 → NASDAQ
 * - T 또는 T+N의 종가/지수가 없으면 pending (집계 안 함)
 * - 표본 min 미만은 rate=null (UI에서 "표본부족" 표기, 침묵 절삭 금지)
 */

const WINDOWS = [5, 20];
const MIN_SAMPLE = 5; // 이 미만이면 적중률(rate) 숨김
const BENCH = { KR: 'KOSPI', US: 'NASDAQ' };

const ret = (a, b) => (a && b ? (b - a) / a : null); // a=시작가, b=종료가

/**
 * @param {Object} history  public/data/history.json 파싱 결과 { 'YYYY-MM-DD': {prices, indices, opinions} }
 * @returns {Object} { asOf, minSample, windows:[5,20], sources:[{person, w5:{hits,total,rate}, w20:{...}, opinions}] }
 */
export function computeSourceScores(history) {
  const dates = Object.keys(history || {}).sort(); // 과거→최신
  // person별 누적: acc[person] = { 5:{hits,total}, 20:{hits,total}, opinions:Set/count }
  const acc = {};
  const bump = (person) => (acc[person] = acc[person] || { 5: { hits: 0, total: 0 }, 20: { hits: 0, total: 0 }, opinions: 0 });

  for (let i = 0; i < dates.length; i++) {
    const T = dates[i];
    const recT = history[T];
    for (const op of recT.opinions || []) {
      if (op.stance !== '강세' && op.stance !== '약세') continue; // 중립 제외
      const a = bump(op.person);
      a.opinions++;
      const bench = BENCH[op.market];
      const p0 = recT.prices?.[op.stock];
      const i0 = recT.indices?.[bench];
      for (const N of WINDOWS) {
        const Tn = dates[i + N];
        if (!Tn) continue; // 아직 N거래일 안 지남 → pending
        const recTn = history[Tn];
        const p1 = recTn.prices?.[op.stock];
        const i1 = recTn.indices?.[bench];
        if (!p0 || !p1 || !i0 || !i1) continue; // 데이터 결손 → pending
        const excess = ret(p0, p1) - ret(i0, i1);
        const hit = op.stance === '강세' ? excess > 0 : excess < 0;
        a[N].total++;
        if (hit) a[N].hits++;
      }
    }
  }

  const rate = (w) => (w.total >= MIN_SAMPLE ? Math.round((w.hits / w.total) * 1000) / 10 : null);
  const sources = Object.entries(acc)
    .map(([person, a]) => ({
      person,
      opinions: a.opinions,
      w5: { hits: a[5].hits, total: a[5].total, rate: rate(a[5]) },
      w20: { hits: a[20].hits, total: a[20].total, rate: rate(a[20]) },
    }))
    // 정렬: 5일 적중률(표본충족) 우선, 그다음 판정건수 → 표본부족은 뒤로
    .sort((x, y) => (y.w5.rate ?? -1) - (x.w5.rate ?? -1) || y.w5.total - x.w5.total);

  return {
    asOf: dates[dates.length - 1] || null,
    minSample: MIN_SAMPLE,
    windows: WINDOWS,
    sources,
  };
}
