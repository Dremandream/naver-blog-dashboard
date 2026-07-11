// 오늘 수집된 모든 소스(블로그+텔레그램)를 통틀어 종목별 언급 횟수 + 강세/약세 비율 집계
export default function TodayStocks({ posts, onStockClick }) {
  // 인물(person) 단위로 집계 — 같은 사람이 블로그+텔레그램에 써도 1명으로.
  // 종목별로 각 인물의 스탠스를 저장하되, 중립보다 강세/약세(비중립)를 우선.
  const stockPersonStance = {}; // { stock: { person: '강세'|'약세'|'중립' } }
  for (const p of posts) {
    const person = p.person || p.blog_name || "unknown";
    const st = p.stance === "강세" ? "강세" : p.stance === "약세" ? "약세" : "중립";
    for (const s of p.stocks ?? []) {
      if (!stockPersonStance[s]) stockPersonStance[s] = {};
      const cur = stockPersonStance[s][person];
      if (!cur || (cur === "중립" && st !== "중립")) stockPersonStance[s][person] = st;
    }
  }

  const stocks = Object.entries(stockPersonStance)
    .map(([name, persons]) => {
      const o = { name, count: 0, bull: 0, bear: 0, neutral: 0 };
      for (const st of Object.values(persons)) {
        o.count += 1;
        if (st === "강세") o.bull += 1;
        else if (st === "약세") o.bear += 1;
        else o.neutral += 1;
      }
      return o;
    })
    .filter((s) => s.count >= 2) // 2명 이상 언급된 종목만 (노이즈 제거)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (stocks.length === 0) return null;

  return (
    <section className="today-stocks">
      <div className="brief-header">
        <span className="brief-label">🎯 핵심 종목</span>
        <span className="brief-date">최근 2일 · 2명 이상 언급 · 클릭 → 종목 리포트</span>
      </div>
      <div className="ts-grid">
        {stocks.map((s) => (
          <button
            key={s.name}
            className="ts-item"
            onClick={() => onStockClick?.(s.name)}
            title={`${s.name} 리포트 열기`}
          >
            <span className="ts-name">
              {s.name}
              {s.bull > 0 && s.bear > 0 && (
                <span className="ts-split" title="강세·약세 시각이 갈리는 종목 — 리서치 가치 높음">🔀 갈림</span>
              )}
            </span>
            <span className="ts-count">{s.count}명 ›</span>
          </button>
        ))}
      </div>
    </section>
  );
}
