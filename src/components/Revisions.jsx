// 관점 변화 추적 (Revisions) — 최근 2일 vs 그 이전 2일 비교
// "어제 대비 무엇이 달라졌나" = 아침 리서치의 핵심. 신규 진입/관심 이탈/시각 전환/심리 변화.

// 주어진 글들에서 종목별 { person: 스탠스(강세/약세/중립) } 맵 구성 (인물 단위, 비중립 우선)
function buildStockStance(posts) {
  const map = {};
  for (const p of posts) {
    const person = p.person || p.blog_name || "unknown";
    const st = p.stance === "강세" ? "강세" : p.stance === "약세" ? "약세" : "중립";
    for (const s of p.stocks ?? []) {
      if (!map[s]) map[s] = {};
      const cur = map[s][person];
      if (!cur || (cur === "중립" && st !== "중립")) map[s][person] = st;
    }
  }
  return map;
}

// 인물 단위 강세/약세 비율
function stanceRatio(posts) {
  const ps = {};
  for (const p of posts) {
    const person = p.person || p.blog_name || "unknown";
    const st = p.stance === "강세" ? "강세" : p.stance === "약세" ? "약세" : "중립";
    const cur = ps[person];
    if (!cur || (cur === "중립" && st !== "중립")) ps[person] = st;
  }
  const vals = Object.values(ps);
  const bull = vals.filter((s) => s === "강세").length;
  const bear = vals.filter((s) => s === "약세").length;
  const total = vals.length || 1;
  return { bull, bear, total, bullPct: Math.round((bull / total) * 100), bearPct: Math.round((bear / total) * 100) };
}

export default function Revisions({ posts, onStockClick }) {
  if (!posts || posts.length === 0) return null;

  const dates = [...new Set(posts.map((p) => p.date))].sort().reverse();
  if (dates.length < 3) return null; // 비교할 이전 데이터 부족

  const recentDates = dates.slice(0, 2);
  const priorDates = dates.slice(2, 4);
  const recent = posts.filter((p) => recentDates.includes(p.date));
  const prior = posts.filter((p) => priorDates.includes(p.date));
  if (prior.length === 0) return null;

  const rStance = buildStockStance(recent);
  const pStance = buildStockStance(prior);
  const rCount = (m, s) => Object.keys(m[s] || {}).length;

  // 신규 진입: 최근 2명+ 언급, 이전엔 없음
  const entered = Object.keys(rStance)
    .filter((s) => rCount(rStance, s) >= 2 && !pStance[s])
    .map((s) => ({ stock: s, n: rCount(rStance, s) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  // 관심 이탈: 이전 2명+ 언급, 최근엔 없음
  const exited = Object.keys(pStance)
    .filter((s) => rCount(pStance, s) >= 2 && !rStance[s])
    .map((s) => ({ stock: s, n: rCount(pStance, s) }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6);

  // 시각 전환: 같은 인물이 같은 종목에 대해 스탠스 변경 (최소 한쪽은 비중립)
  const flips = [];
  for (const s of Object.keys(rStance)) {
    if (!pStance[s]) continue;
    for (const person of Object.keys(rStance[s])) {
      const now = rStance[s][person];
      const before = pStance[s][person];
      if (before && now !== before && (now !== "중립" || before !== "중립")) {
        flips.push({ stock: s, person, before, now });
      }
    }
  }
  const flipsTop = flips.slice(0, 8);

  // 심리 변화
  const r = stanceRatio(recent);
  const p = stanceRatio(prior);
  const bullDelta = r.bullPct - p.bullPct;

  const nothing = entered.length === 0 && exited.length === 0 && flipsTop.length === 0 && bullDelta === 0;
  if (nothing) return null;

  const Chips = ({ items, cls }) => (
    <div className="rev-chips">
      {items.map(({ stock, n }) => (
        <button key={stock} className={`rev-chip ${cls}`} onClick={() => onStockClick?.(stock)} title={`${stock} 검색`}>
          {stock} <span className="rev-chip-n">{n}명</span>
        </button>
      ))}
    </div>
  );

  return (
    <section className="revisions">
      <div className="brief-header">
        <span className="brief-label">🔄 관점 변화 <span className="rev-sub">최근 2일 vs 이전 2일</span></span>
        <span className="brief-date">
          강세 비중 {p.bullPct}% → {r.bullPct}%{" "}
          {bullDelta !== 0 && (
            <span className={bullDelta > 0 ? "rev-up" : "rev-down"}>
              {bullDelta > 0 ? "▲" : "▼"}{Math.abs(bullDelta)}%p
            </span>
          )}
        </span>
      </div>

      <div className="rev-grid">
        {entered.length > 0 && (
          <div className="rev-block">
            <div className="rev-block-title rev-t-enter">📈 새로 부각된 종목</div>
            <Chips items={entered} cls="rev-enter" />
          </div>
        )}
        {exited.length > 0 && (
          <div className="rev-block">
            <div className="rev-block-title rev-t-exit">📉 관심에서 멀어진 종목</div>
            <Chips items={exited} cls="rev-exit" />
          </div>
        )}
      </div>

      {flipsTop.length > 0 && (
        <div className="rev-block">
          <div className="rev-block-title rev-t-flip">🔀 시각을 바꾼 소스</div>
          <ul className="rev-flip-list">
            {flipsTop.map((f, i) => (
              <li key={i}>
                <b>{f.person}</b>
                <span className="rev-stock" onClick={() => onStockClick?.(f.stock)}>{f.stock}</span>
                <span className={`rev-badge rev-b-${f.before === "강세" ? "bull" : f.before === "약세" ? "bear" : "neu"}`}>{f.before}</span>
                <span className="rev-arrow">→</span>
                <span className={`rev-badge rev-b-${f.now === "강세" ? "bull" : f.now === "약세" ? "bear" : "neu"}`}>{f.now}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
