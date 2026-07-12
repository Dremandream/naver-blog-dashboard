// 종목 관심 추이 — 관점 변화(delta) + 주간 트렌드(level)를 한 뷰로 통합
// 7일 언급 수준 + 최근 2일 vs 이전 2일 변화 + 의견 갈림 + 시각 전환

function buildStockStance(posts) {
  const m = {};
  for (const p of posts) {
    const person = p.person || p.blog_name || "unknown";
    const st = p.stance === "강세" ? "강세" : p.stance === "약세" ? "약세" : "중립";
    for (const s of p.stocks ?? []) {
      if (!m[s]) m[s] = {};
      const cur = m[s][person];
      if (!cur || (cur === "중립" && st !== "중립")) m[s][person] = st;
    }
  }
  return m;
}

function stanceRatio(posts) {
  const ps = {};
  for (const p of posts) {
    const person = p.person || p.blog_name || "unknown";
    const st = p.stance === "강세" ? "강세" : p.stance === "약세" ? "약세" : "중립";
    const cur = ps[person];
    if (!cur || (cur === "중립" && st !== "중립")) ps[person] = st;
  }
  const vals = Object.values(ps);
  const total = vals.length || 1;
  return { bullPct: Math.round((vals.filter((s) => s === "강세").length / total) * 100) };
}

const STATUS = {
  new: { label: "🆕 신규", cls: "at-new" },
  up: { label: "▲ 급증", cls: "at-up" },
  down: { label: "▼ 둔화", cls: "at-down" },
  flat: { label: "= 유지", cls: "at-flat" },
  idle: { label: "· 소강", cls: "at-idle" },
};

export default function AttentionTrends({ posts, onStockClick }) {
  if (!posts || posts.length === 0) return null;

  const dates = [...new Set(posts.map((p) => p.date))].sort().reverse();
  const recentDates = dates.slice(0, 2);
  const priorDates = dates.slice(2, 4);

  const P7 = buildStockStance(posts);
  const R = buildStockStance(posts.filter((p) => recentDates.includes(p.date)));
  const Pr = buildStockStance(posts.filter((p) => priorDates.includes(p.date)));
  const cnt = (m, s) => Object.keys(m[s] || {}).length;

  const rows = Object.keys(P7)
    .map((s) => {
      const week = cnt(P7, s), r = cnt(R, s), p = cnt(Pr, s);
      let status = "idle";
      if (p === 0 && r > 0) status = "new";
      else if (r > p) status = "up";
      else if (r < p) status = "down";
      else if (r > 0) status = "flat";
      const vals = Object.values(P7[s]);
      const bull = vals.filter((x) => x === "강세").length;
      const bear = vals.filter((x) => x === "약세").length;
      return { stock: s, week, r, p, status, split: bull > 0 && bear > 0 };
    })
    .filter((x) => x.week >= 2)
    .sort((a, b) => b.week - a.week)
    .slice(0, 10);

  if (rows.length === 0) return null;
  const maxWeek = Math.max(...rows.map((r) => r.week));

  // 시각 전환
  const flips = [];
  for (const s of Object.keys(R)) {
    if (!Pr[s]) continue;
    for (const person of Object.keys(R[s])) {
      const now = R[s][person], before = Pr[s][person];
      if (before && now !== before && (now !== "중립" || before !== "중립")) {
        flips.push(`${person}: ${s} ${before}→${now}`);
      }
    }
  }

  // 강세 비중 변화
  const rBull = stanceRatio(posts.filter((p) => recentDates.includes(p.date))).bullPct;
  const pBull = priorDates.length ? stanceRatio(posts.filter((p) => priorDates.includes(p.date))).bullPct : rBull;
  const delta = rBull - pBull;

  return (
    <section className="attention">
      <div className="brief-header">
        <span className="brief-label">🔎 종목 관심 추이 <span className="at-sub">7일 언급 + 어제 대비 변화</span></span>
        {priorDates.length > 0 && (
          <span className="brief-date">
            강세 비중 {pBull}% → {rBull}%{" "}
            {delta !== 0 && <span className={delta > 0 ? "at-c-up" : "at-c-down"}>{delta > 0 ? "▲" : "▼"}{Math.abs(delta)}%p</span>}
          </span>
        )}
      </div>

      <div className="at-list">
        {rows.map((x) => (
          <button key={x.stock} className="at-row" onClick={() => onStockClick?.(x.stock)} title={`${x.stock} 리포트 열기`}>
            <span className="at-name">
              {x.stock}
              {x.split && <span className="at-split" title="강세·약세가 갈리는 종목">🔀</span>}
            </span>
            <span className="at-bar-wrap">
              <span className="at-bar" style={{ width: `${(x.week / maxWeek) * 100}%` }} />
            </span>
            <span className="at-week">{x.week}명</span>
            <span className="at-delta">{x.p}→{x.r}</span>
            <span className={`at-status ${STATUS[x.status].cls}`}>{STATUS[x.status].label}</span>
          </button>
        ))}
      </div>

      {flips.length > 0 && (
        <div className="at-flips">
          <span className="at-flips-label">🔀 시각 전환</span>
          {flips.slice(0, 6).map((f, i) => <span key={i} className="at-flip">{f}</span>)}
        </div>
      )}
    </section>
  );
}
