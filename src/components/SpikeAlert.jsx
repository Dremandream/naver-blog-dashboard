export default function SpikeAlert({ posts, onStockClick }) {
  if (!posts || posts.length === 0) return null;

  // 날짜별, 종목별로 언급한 블로거 Set 집계
  const byDate = {};
  posts.forEach(p => {
    if (!p.date || !p.stocks?.length) return;
    if (!byDate[p.date]) byDate[p.date] = {};
    p.stocks.forEach(s => {
      if (!byDate[p.date][s]) byDate[p.date][s] = new Set();
      byDate[p.date][s].add(p.blog_name || p.blog_id || 'unknown');
    });
  });

  const dates = Object.keys(byDate).sort().reverse();
  if (dates.length < 2) return null;

  const today     = dates[0];
  const prevDates = dates.slice(1, 4);

  const todayStocks = Object.keys(byDate[today] || {});
  const spikes = [];

  todayStocks.forEach(stock => {
    const todayCnt = byDate[today][stock]?.size || 0;
    if (todayCnt < 2) return;
    const prevCnts = prevDates.map(d => byDate[d]?.[stock]?.size || 0);
    const prevAvg  = prevCnts.reduce((a, b) => a + b, 0) / Math.max(prevCnts.length, 1);
    const ratio    = prevAvg === 0 ? todayCnt : todayCnt / prevAvg;
    if (ratio >= 2) spikes.push({ stock, todayCnt, prevAvg, ratio });
  });

  if (spikes.length === 0) return null;
  spikes.sort((a, b) => b.ratio - a.ratio || b.todayCnt - a.todayCnt);

  return (
    <section className="spike-alert">
      <div className="brief-header">
        <span className="spike-label">⚡ 스파이크 감지</span>
        <span className="brief-date">{today} 기준</span>
      </div>
      <div className="spike-list">
        {spikes.slice(0, 5).map(({ stock, todayCnt, prevAvg, ratio }) => (
          <div key={stock} className="spike-row">
            <span
              className="spike-stock"
              onClick={() => onStockClick?.(stock)}
              style={onStockClick ? { cursor: 'pointer' } : {}}
            >{stock}</span>
            <span className="spike-cnt">블로거 {todayCnt}명</span>
            <span className="spike-arrow">↑</span>
            <span className="spike-ratio">{prevAvg === 0 ? '신규' : `${ratio.toFixed(1)}×`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
