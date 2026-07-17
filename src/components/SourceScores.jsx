// 소스 적중률 — 필자별 의견의 사후 성과(지수 대비 초과수익) 기록
// 매매 추천이 아니라 "이 소스의 과거 강세/약세 의견이 지수 대비 맞았는가"의 누적 집계.
// 데이터는 scripts/hitrate.js가 계산해 posts.json의 source_scores에 저장.

function Cell({ w }) {
  if (w.rate != null) {
    const cls = w.rate >= 60 ? "ss-hit-good" : w.rate >= 40 ? "ss-hit-mid" : "ss-hit-low";
    return <span className={cls}>{w.rate}% <span className="ss-frac">· {w.total}건 중 {w.hits}건 적중</span></span>;
  }
  if (w.total > 0) return <span className="ss-thin">표본 적음 ({w.total}건)</span>;
  return <span className="ss-thin">결과 대기</span>;
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
          🎯 소스 적중률 <span className="at-sub">필자 의견이 지수보다 맞았는지 · 5·20일 후</span>
        </span>
        {scores.asOf && <span className="brief-date">{scores.asOf} 기준</span>}
      </div>

      <div className="ss-lead">
        각 필자가 <b>‘강세/약세’</b>라고 밝힌 종목이, 이후 지수(국내 코스피·해외 나스닥)보다
        더 잘 맞았는지를 비율로 보여줍니다.
      </div>

      {allPending && (
        <div className="ss-pending">
          아직 판정된 의견이 없습니다. 의견을 낸 지 <b>5거래일</b>이 지나면 하나씩 결과가 채워집니다.
        </div>
      )}

      <div className="ss-list">
        <div className="ss-row ss-head" aria-hidden="true">
          <span className="ss-name">소스</span>
          <span className="ss-col" title="강세·약세로 방향을 밝힌 종목 수 (중립 제외)">밝힌 의견</span>
          <span className="ss-col" title="의견을 낸 지 5거래일 후 지수 대비 결과">5일 후 적중</span>
          <span className="ss-col" title="의견을 낸 지 20거래일 후 지수 대비 결과">20일 후 적중</span>
        </div>
        {sources.map((s) => (
          <div className="ss-row" key={s.person}>
            <span className="ss-name">{s.person}</span>
            <span className="ss-col ss-thin">{s.opinions}건</span>
            <span className="ss-col"><Cell w={s.w5} /></span>
            <span className="ss-col"><Cell w={s.w20} /></span>
          </div>
        ))}
      </div>

      <div className="ss-note">
        <b>적중</b> = 강세라던 종목이 지수보다 <b>더 오르거나</b>, 약세라던 종목이 지수보다
        <b> 덜 오르거나 하락</b>하면 ‘맞음’. (기준 지수: 국내 코스피, 해외 나스닥)<br />
        예: ‘<b>52.6% · 152건 중 80건 적중</b>’이면 방향을 밝힌 판정 152건 중 80건이 지수 대비 맞았다는 뜻.
        판정 건수가 {min}건보다 적으면 ‘표본 적음’으로 비율을 숨깁니다. <b>매매 추천이 아니라 과거 성적표</b>입니다.
      </div>
    </section>
  );
}
