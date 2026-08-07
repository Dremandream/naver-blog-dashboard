export default function PeterFearGreed({ data }) {
  if (!data || data.score == null) {
    return (
      <div className="fs-section pfg">
        <div className="fs-title">피터케이 Fear &amp; Greed <span className="pfg-beta">BETA</span></div>
        <div className="pfg-empty">최근 7일 시장 관점 글이 없습니다.</div>
      </div>
    );
  }

  return (
    <div className="fs-section pfg">
      <div className="fs-title">피터케이 Fear &amp; Greed <span className="pfg-beta">BETA</span></div>
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
              <span className={item.sentiment < 0 ? "pfg-bear" : item.sentiment > 0 ? "pfg-bull" : ""}>
                {item.sentiment < 0 ? "▼" : item.sentiment > 0 ? "▲" : "—"}
              </span>
              <span>{item.title}</span>
            </div>
          ))}
        </div>
      )}
      <div className="fs-note">피터케이의 시장 발언을 수치화한 실험 지표 · 매매 신호 아님 · 2년 백테스트 전</div>
    </div>
  );
}
