// 소스 적중률 — 필자별 의견의 사후 성과(지수 대비 초과수익) 기록
// 매매 추천이 아니라 "이 소스의 과거 강세/약세 의견이 지수 대비 맞았는가"의 누적 집계.
// 데이터는 scripts/hitrate.js가 계산해 posts.json의 source_scores에 저장.

function Cell({ w, min }) {
  if (w.rate != null) {
    const cls = w.rate >= 60 ? "ss-hit-good" : w.rate >= 40 ? "ss-hit-mid" : "ss-hit-low";
    return <span className={cls}>{w.rate}% <span className="ss-frac">({w.hits}/{w.total})</span></span>;
  }
  if (w.total > 0) return <span className="ss-thin">표본부족 <span className="ss-frac">({w.hits}/{w.total})</span></span>;
  return <span className="ss-thin">판정중</span>;
}

export default function SourceScores({ scores }) {
  const sources = scores?.sources ?? [];
  if (sources.length === 0) return null;

  const allPending = sources.every((s) => s.w5.total === 0 && s.w20.total === 0);
  const min = scores.minSample;

  return (
    <section className="source-scores">
      <div className="brief-header">
        <span className="brief-label">
          🎯 소스 적중률 <span className="at-sub">지수 대비 초과수익 · 5·20거래일</span>
        </span>
        {scores.asOf && <span className="brief-date">{scores.asOf} 기준</span>}
      </div>

      {allPending && (
        <div className="ss-pending">
          필자별 의견의 성과를 추적하기 시작했습니다. 각 의견이 <b>5거래일</b>을 지나면 지수 대비
          적중 여부가 집계됩니다 — 가장 이른 의견부터 순차적으로 채워집니다.
        </div>
      )}

      <div className="ss-list">
        <div className="ss-row ss-head" aria-hidden="true">
          <span className="ss-name">소스</span>
          <span className="ss-col">의견</span>
          <span className="ss-col">5일 적중</span>
          <span className="ss-col">20일 적중</span>
        </div>
        {sources.map((s) => (
          <div className="ss-row" key={s.person}>
            <span className="ss-name">{s.person}</span>
            <span className="ss-col ss-thin">{s.opinions}건</span>
            <span className="ss-col"><Cell w={s.w5} min={min} /></span>
            <span className="ss-col"><Cell w={s.w20} min={min} /></span>
          </div>
        ))}
      </div>

      <div className="ss-note">
        적중 = 강세 의견은 지수보다 더 오름, 약세 의견은 지수 대비 덜 오름/하락 (벤치마크: 국내=코스피,
        해외=나스닥). 표본 {min}건 미만은 적중률을 숨기고 건수만 표시합니다. 중립 의견은 집계에서 제외.
        <b> 매매 추천이 아니라 과거 의견의 사후 성과 기록</b>입니다.
      </div>
    </section>
  );
}
