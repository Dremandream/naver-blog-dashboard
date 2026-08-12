function metric(value) {
  if (value == null) return '대기';
  return `${value > 0 ? '+' : ''}${value}%`;
}

function BacktestRow({ label, result }) {
  if (!result) return null;
  return (
    <div className="pfg-backtest-row">
      <b>{label} · {result.events}회</b>
      <span>KOSPI 5일 {metric(result.w?.[5]?.KOSPI?.avg)} · 20일 {metric(result.w?.[20]?.KOSPI?.avg)}</span>
      <span>KOSDAQ 5일 {metric(result.w?.[5]?.KOSDAQ?.avg)} · 20일 {metric(result.w?.[20]?.KOSDAQ?.avg)}</span>
    </div>
  );
}

export default function PeterFearGreed({ data }) {
  const hasCurrent = data?.score != null;
  const backtest = data?.backtest;
  const history = data?.history;
  const fearSamples = backtest?.fear?.events ?? 0;

  return (
    <div className="fs-section pfg">
      <div className="fs-title">피터케이 Fear &amp; Greed <span className="pfg-beta">BETA</span></div>
      {hasCurrent ? (
        <>
          <div className="pfg-score-row">
            <strong className="pfg-score">{data.score}</strong>
            <div>
              <div className="pfg-label">{data.label}</div>
              <div className="pfg-asof">{data.asOf} 기준</div>
            </div>
          </div>
          <div className="pfg-gauge" aria-label={`피터케이 심리지수 ${data.score}점`}>
            <span className="pfg-marker" style={{ left: `${data.score}%` }} />
          </div>
          <div className="pfg-scale"><span>공포</span><span>중립</span><span>탐욕</span></div>
          <p className="pfg-interpretation">{data.interpretation}</p>
          <div className="pfg-meta">최근 7일 · {data.postCount}개 글/{data.dayCount}일 · 신뢰도 {data.confidence}</div>
          {data.evidence?.length > 0 && (
            <div className="pfg-evidence">
              {data.evidence.slice(0, 2).map((item) => (
                <div className="pfg-evidence-item" key={item.id}>
                  <span className={item.sentiment < 0 ? 'pfg-bear' : item.sentiment > 0 ? 'pfg-bull' : ''}>
                    {item.sentiment < 0 ? '▼' : item.sentiment > 0 ? '▲' : '—'}
                  </span>
                  <span>{item.title}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="pfg-empty">최근 7일 시장 관점 글이 없습니다.</div>
      )}

      {backtest && (
        <div className="pfg-backtest">
          <div className="pfg-backtest-head">
            <b>장기 검증</b>
            <span>{history?.start}~{history?.end} · 시장 글 {backtest.marketPostCount}개</span>
          </div>
          <BacktestRow label="극단 공포 후" result={backtest.fear} />
          <details>
            <summary>극단 탐욕 결과도 보기</summary>
            <BacktestRow label="극단 탐욕 후" result={backtest.greed} />
          </details>
          <p className="pfg-caveat">
            {fearSamples < 5
              ? `극단 공포 표본이 ${fearSamples}회뿐이라 저점 가설을 확정할 수 없습니다.`
              : '과거 평균은 참고용이며 미래 수익을 보장하지 않습니다.'}
          </p>
        </div>
      )}
      <div className="fs-note">피터케이의 시장 발언을 수치화한 실험 지표 · 매매 신호 아님 · 다음 거래일 종가 기준</div>
    </div>
  );
}
