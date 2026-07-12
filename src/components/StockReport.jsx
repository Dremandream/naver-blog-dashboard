// 개별 종목 리포트 — 종목 하나에 대한 모든 소스의 시각을 미니 리서치 노트로 종합
function SourceLine({ p }) {
  return (
    <li className="sr-item">
      <div className="sr-item-head">
        {p.source === "telegram" && <span className="source-badge source-telegram">📱</span>}
        <b>{p.blog_name}</b>
        <span className="sr-date">{p.date}</span>
        {p.url && (
          <a className="sr-link" href={p.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>원문 ↗</a>
        )}
      </div>
      <p className="sr-text">{p.reasoning || p.summary}</p>
    </li>
  );
}

function Pct({ v }) {
  if (v == null) return null;
  const cls = v > 0 ? "at-px-up" : v < 0 ? "at-px-down" : "at-px-flat";
  return <span className={cls}>{v > 0 ? "+" : ""}{v}%</span>;
}

export default function StockReport({ stock, posts, price, onClose }) {
  if (!stock) return null;

  const rel = posts
    .filter((p) => (p.stocks || []).includes(stock))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 인물 단위 스탠스 분포 (비중립 우선)
  const personStance = {};
  for (const p of rel) {
    const person = p.person || p.blog_name || "unknown";
    const st = p.stance === "강세" ? "강세" : p.stance === "약세" ? "약세" : "중립";
    const cur = personStance[person];
    if (!cur || (cur === "중립" && st !== "중립")) personStance[person] = st;
  }
  const vals = Object.values(personStance);
  const bull = vals.filter((s) => s === "강세").length;
  const bear = vals.filter((s) => s === "약세").length;
  const neutral = vals.filter((s) => s === "중립").length;
  const total = vals.length || 1;

  const bullPosts = rel.filter((p) => p.stance === "강세");
  const bearPosts = rel.filter((p) => p.stance === "약세");
  const numbers = [...new Set(rel.flatMap((p) => p.numbers || []))].slice(0, 8);
  const risks = [...new Set(rel.flatMap((p) => p.risks || []))].slice(0, 5);
  const dates = [...new Set(rel.map((p) => p.date))];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="report-kicker">종목 리포트</div>
            <h2 className="sr-title">{stock}</h2>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {price && (
          <div className="sr-price">
            <span className="sr-price-now">{price.price.toLocaleString()}{price.market === "KR" ? "원" : ""}</span>
            <span className="sr-price-chg">1일 <Pct v={price.d1} /> · 5일 <Pct v={price.d5} /> · 20일 <Pct v={price.d20} /></span>
          </div>
        )}
        <div className="sr-meta">
          최근 {dates.length}일 · 언급 {total}명 · 강세 {bull} / 약세 {bear} / 중립 {neutral}
        </div>
        <div className="sr-bar">
          <span className="ts-seg ts-bull" style={{ width: `${(bull / total) * 100}%` }} />
          <span className="ts-seg ts-neutral" style={{ width: `${(neutral / total) * 100}%` }} />
          <span className="ts-seg ts-bear" style={{ width: `${(bear / total) * 100}%` }} />
        </div>

        {bullPosts.length > 0 && (
          <div className="sr-section">
            <div className="report-block-title" style={{ color: "#b91c1c" }}>📈 강세 시각 ({bullPosts.length})</div>
            <ul className="sr-list">{bullPosts.map((p, i) => <SourceLine key={i} p={p} />)}</ul>
          </div>
        )}
        {bearPosts.length > 0 && (
          <div className="sr-section">
            <div className="report-block-title" style={{ color: "#1d4ed8" }}>📉 약세·신중 시각 ({bearPosts.length})</div>
            <ul className="sr-list">{bearPosts.map((p, i) => <SourceLine key={i} p={p} />)}</ul>
          </div>
        )}

        {numbers.length > 0 && (
          <div className="sr-section">
            <div className="report-block-title">💰 언급된 수치</div>
            <div className="card-numbers">{numbers.map((n, i) => <span key={i} className="number-chip">{n}</span>)}</div>
          </div>
        )}
        {risks.length > 0 && (
          <div className="sr-section">
            <div className="report-block-title" style={{ color: "#b45309" }}>⚠️ 리스크</div>
            <ul className="key-points">{risks.map((r, i) => <li key={i}>• {r}</li>)}</ul>
          </div>
        )}

        {rel.length === 0 && <p className="sr-empty">이 종목에 대한 최근 글이 없습니다.</p>}
      </div>
    </div>
  );
}
