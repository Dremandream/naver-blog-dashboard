// 팩트 사이드바 — 증권사 리포트 우측 데이터 컬럼 (본문=주장, 사이드바=검증 데이터)
function Pct({ v }) {
  if (v == null) return null;
  const cls = v > 0 ? "at-px-up" : v < 0 ? "at-px-down" : "at-px-flat";
  return <span className={cls}>{v > 0 ? "+" : ""}{v}%</span>;
}

function Flow({ label, v }) {
  if (v == null) return null;
  const cls = v > 0 ? "at-px-up" : v < 0 ? "at-px-down" : "at-px-flat";
  const abs = Math.abs(v);
  const fmt = abs >= 10000 ? `${(v / 10000).toFixed(1)}조` : `${v.toLocaleString()}억`;
  return (
    <div className="fs-row">
      <span className="fs-label">{label}</span>
      <span className={`fs-val ${cls}`}>{v > 0 ? "+" : ""}{fmt}</span>
    </div>
  );
}

function IndexCard({ name, m }) {
  if (!m?.index) return null;
  return (
    <div className="fs-index">
      <div className="fs-row">
        <span className="fs-name">{name}</span>
        <span className="fs-price">{m.index.toLocaleString()}</span>
      </div>
      <div className="fs-row">
        <span className="fs-label">1일 / 5일</span>
        <span className="fs-val"><Pct v={m.d1} /> / <Pct v={m.d5} /></span>
      </div>
      {m.flows && (
        <>
          <Flow label="외국인" v={m.flows.foreign} />
          <Flow label="기관" v={m.flows.institution} />
          <Flow label="개인" v={m.flows.individual} />
        </>
      )}
    </div>
  );
}

export default function FactSidebar({ market, verdicts, onStockClick }) {
  const review = (verdicts?.items ?? []).filter((it) => it.verdict === "needs_review");
  const asOf = market?.kospi?.asOf || market?.kosdaq?.asOf;
  const asOfFmt = asOf ? `${asOf.slice(4, 6)}.${asOf.slice(6, 8)} 종가` : null;
  const hasMarket = market && (market.kospi || market.kosdaq);
  if (!hasMarket && review.length === 0) return null;

  return (
    <aside className="fact-sidebar">
      {hasMarket && (
        <div className="fs-section">
          <div className="fs-title">시황{asOfFmt && <span className="fs-asof"> · {asOfFmt}</span>}</div>
          <IndexCard name="코스피" m={market.kospi} />
          <IndexCard name="코스닥" m={market.kosdaq} />
        </div>
      )}
      {review.length > 0 && (
        <div className="fs-section">
          <div className="fs-title">⚖️ 여론·주가 역행 감지</div>
          {review.map((it) => (
            <div className="fs-row" key={it.ticker}>
              <span
                className="fs-name stock-tag-clickable"
                onClick={() => onStockClick?.(it.ticker)}
              >
                {it.ticker}
              </span>
              <span className="fs-val fs-review">
                여론 {it.DIR === "bull" ? "강세" : it.DIR === "bear" ? "약세" : "혼재"} vs 5일 <Pct v={it.P5} />
              </span>
            </div>
          ))}
          <div className="fs-note">여론 방향과 주가가 반대인 종목 — 해석 주의</div>
        </div>
      )}
    </aside>
  );
}
