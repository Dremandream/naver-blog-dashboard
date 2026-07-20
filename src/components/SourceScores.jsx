// 소스 적중률 — 필자별 의견의 사후 성과(지수 대비 초과수익) 기록
// 매매 추천이 아니라 "이 소스의 과거 강세/약세 의견이 지수 대비 맞았는가"의 누적 집계.
// 데이터는 scripts/hitrate.js가 계산해 posts.json의 source_scores에 저장. 창은 windows 메타로 동적 렌더.

function Cell({ w }) {
  if (!w) return <span className="ss-thin">—</span>;
  if (w.rate != null) {
    const cls = w.rate >= 60 ? "ss-hit-good" : w.rate >= 40 ? "ss-hit-mid" : "ss-hit-low";
    return <span className={cls}>{w.rate}% <span className="ss-frac">· {w.total}건 중 {w.hits}건 적중</span></span>;
  }
  if (w.total > 0) return <span className="ss-thin">표본 적음 ({w.total}건)</span>;
  return <span className="ss-thin">결과 대기</span>;
}

export default function SourceScores({ scores }) {
  const sources = scores?.sources ?? [];
  const windows = scores?.windows ?? [];
  if (sources.length === 0 || windows.length === 0) return null;

  const min = scores.minSample;
  const winLabels = windows.map((w) => w.label).join("·");
  const first = windows[0];
  const allPending = sources.every((s) => windows.every((w) => (s.w?.[w.n]?.total ?? 0) === 0));

  return (
    <section className="source-scores">
      <div className="brief-header">
        <span className="brief-label">
          🎯 소스 적중률 <span className="at-sub">필자 의견이 지수보다 맞았는지 · {winLabels} 후</span>
        </span>
        {scores.asOf && <span className="brief-date">{scores.asOf} 기준</span>}
      </div>

      <div className="ss-lead">
        각 필자가 <b>‘강세/약세’</b>라고 밝힌 종목이, 이후 지수(국내 코스피·해외 나스닥)보다
        더 잘 맞았는지를 기간별 비율로 보여줍니다.
      </div>

      {allPending && (
        <div className="ss-pending">
          아직 판정된 의견이 없습니다. 의견을 낸 지 <b>{first.label}</b>이 지나면 하나씩 결과가 채워집니다.
        </div>
      )}

      <div className="ss-list">
        <div className="ss-row ss-head" aria-hidden="true">
          <span className="ss-name">소스</span>
          <span className="ss-col" title="강세·약세로 방향을 밝힌 종목 수 (중립 제외)">밝힌 의견</span>
          {windows.map((w) => (
            <span className="ss-col" key={w.n} title={`의견을 낸 지 ${w.label} 후 지수 대비 결과`}>
              {w.label} 후 적중
            </span>
          ))}
        </div>
        {sources.map((s) => (
          <div className="ss-row" key={s.person}>
            <span className="ss-name">{s.person}</span>
            <span className="ss-col ss-thin">{s.opinions}건</span>
            {windows.map((w) => (
              <span className="ss-col" key={w.n}><Cell w={s.w?.[w.n]} /></span>
            ))}
          </div>
        ))}
      </div>

      <div className="ss-note">
        <b>적중</b> = 강세라던 종목이 지수보다 <b>더 오르거나</b>, 약세라던 종목이 지수보다
        <b> 덜 오르거나 하락</b>하면 ‘맞음’. (기준 지수: 국내 코스피, 해외 나스닥)<br />
        예: ‘<b>52.6% · 152건 중 80건 적중</b>’이면 방향을 밝힌 판정 152건 중 80건이 지수 대비 맞았다는 뜻.
        판정 건수가 {min}건보다 적으면 ‘표본 적음’으로 비율을 숨깁니다. <b>1년</b>처럼 아직 그만큼
        기간이 안 지난 창은 ‘결과 대기’로 두고, 데이터가 쌓이면 채워집니다. <b>매매 추천이 아니라 과거 성적표</b>입니다.
      </div>
    </section>
  );
}
