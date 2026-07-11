export default function WeeklyTrend({ briefs, onStockClick }) {
  if (!briefs || briefs.length < 2) return null;

  const totalDays = briefs.length;

  // 종목별 언급 횟수 집계
  const freq = {};
  briefs.forEach(b => {
    (b.hot_stocks ?? []).forEach(s => {
      freq[s] = (freq[s] || 0) + 1;
    });
  });

  // 2일 이상 언급된 종목만, 빈도 내림차순
  const ranked = Object.entries(freq)
    .filter(([, cnt]) => cnt >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (ranked.length === 0) return null;

  const maxCnt = ranked[0][1];

  return (
    <section className="weekly-trend">
      <div className="brief-header">
        <span className="brief-label">📊 주간 관심 종목 트렌드</span>
        <span className="brief-date">최근 {totalDays}일 종목 언급 빈도</span>
      </div>
      <div className="trend-list">
        {ranked.map(([stock, cnt]) => (
          <div key={stock} className="trend-row">
            <span
              className="trend-stock"
              onClick={() => onStockClick?.(stock)}
              style={onStockClick ? { cursor: 'pointer' } : {}}
            >{stock}</span>
            <div className="trend-bar-wrap">
              <div
                className="trend-bar"
                style={{ width: `${(cnt / maxCnt) * 100}%` }}
              />
            </div>
            <span className="trend-count">{cnt}/{totalDays}일</span>
          </div>
        ))}
      </div>
    </section>
  );
}
