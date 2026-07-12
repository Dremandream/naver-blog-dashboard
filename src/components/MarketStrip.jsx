// 시황 스트립 — 지수 + 외인/기관 수급 한 줄 (리포트의 배경 데이터)
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
  return <span className="ms-flow">{label} <b className={cls}>{v > 0 ? "+" : ""}{fmt}</b></span>;
}

function IndexBlock({ name, m }) {
  if (!m?.index) return null;
  return (
    <div className="ms-block">
      <span className="ms-name">{name}</span>
      <span className="ms-index">{m.index.toLocaleString()}</span>
      <span className="ms-chg">1일 <Pct v={m.d1} /> · 5일 <Pct v={m.d5} /></span>
      {m.flows && (
        <span className="ms-flows">
          <Flow label="외인" v={m.flows.foreign} />
          <Flow label="기관" v={m.flows.institution} />
          <Flow label="개인" v={m.flows.individual} />
        </span>
      )}
    </div>
  );
}

export default function MarketStrip({ market }) {
  if (!market || (!market.kospi && !market.kosdaq)) return null;
  return (
    <div className="market-strip">
      <IndexBlock name="코스피" m={market.kospi} />
      <IndexBlock name="코스닥" m={market.kosdaq} />
      <span className="ms-note">수급: 최근 거래일 순매수</span>
    </div>
  );
}
