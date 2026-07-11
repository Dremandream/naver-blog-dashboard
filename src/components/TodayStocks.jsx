// 오늘 수집된 모든 소스(블로그+텔레그램)를 통틀어 종목별 언급 횟수 + 강세/약세 비율 집계
export default function TodayStocks({ posts, onStockClick }) {
  const map = {};
  for (const p of posts) {
    for (const s of p.stocks ?? []) {
      if (!map[s]) map[s] = { name: s, count: 0, bull: 0, bear: 0, neutral: 0 };
      map[s].count += 1;
      if (p.stance === "강세") map[s].bull += 1;
      else if (p.stance === "약세") map[s].bear += 1;
      else map[s].neutral += 1;
    }
  }

  const stocks = Object.values(map)
    .filter((s) => s.count >= 2) // 2회 이상 언급된 종목만 (노이즈 제거)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  if (stocks.length === 0) return null;

  return (
    <section className="today-stocks">
      <div className="brief-header">
        <span className="brief-label">🎯 오늘의 핵심 종목</span>
        <span className="brief-date">2회 이상 언급 · 강세/약세 비율</span>
      </div>
      <div className="ts-grid">
        {stocks.map((s) => {
          const total = s.bull + s.bear + s.neutral || 1;
          return (
            <button
              key={s.name}
              className="ts-item"
              onClick={() => onStockClick?.(s.name)}
              title={`${s.name} 검색`}
            >
              <div className="ts-top">
                <span className="ts-name">{s.name}</span>
                <span className="ts-count">{s.count}회</span>
              </div>
              <div className="ts-bar">
                <span className="ts-seg ts-bull" style={{ width: `${(s.bull / total) * 100}%` }} />
                <span className="ts-seg ts-neutral" style={{ width: `${(s.neutral / total) * 100}%` }} />
                <span className="ts-seg ts-bear" style={{ width: `${(s.bear / total) * 100}%` }} />
              </div>
              <div className="ts-legend">
                {s.bull > 0 && <span className="ts-l-bull">강세 {s.bull}</span>}
                {s.neutral > 0 && <span className="ts-l-neutral">중립 {s.neutral}</span>}
                {s.bear > 0 && <span className="ts-l-bear">약세 {s.bear}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
