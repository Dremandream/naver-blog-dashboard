export default function SpikeAlert({ posts }) {
  if (!posts || posts.length === 0) return null;

  // 날짜별 종목 언급 횟수 집계
  const byDate = {};
  posts.forEach(p => {
    if (!p.date || !p.stocks?.length) return;
    if (!byDate[p.date]) byDate[p.date] = {};
    p.stocks.forEach(s => {
      byDate[p.date][s] = (byDate[p.date][s] || 0) + 1;
    });
  });

  const dates = Object.keys(byDate).sort().reverse(); // 최신순
  if (dates.length < 2) return null;

  const today = dates[0];
  const prevDates = dates.slice(1, 4); // 최대 3일치 이전 데이터

  // 종목별 이전 일 평균
  const allStocks = new Set([
    ...Object.keys(byDate[today] || {}),
    ...prevDates.flatMap(d => Object.keys(byDate[d] || {})),
  ]);

  const spikes = [];
  allStocks.forEach(stock => {
    const todayCnt = byDate[today][stock] || 0;
    if (todayCnt < 2) return; // 오늘 최소 2번 언급

    const prevCnts = prevDates.map(d => byDate[d][stock] || 0);
    const prevAvg = prevCnts.reduce((a, b) => a + b, 0) / prevCnts.length;

    // 이전에 없었거나 2배 이상 급증
    const ratio = prevAvg === 0 ? todayCnt : todayCnt / prevAvg;
    if (ratio >= 2) {
      spikes.push({ stock, todayCnt, prevAvg, ratio });
    }
  });

  if (spikes.length === 0) return null;

  spikes.sort((a, b) => b.ratio - a.ratio);

  return (
    <section className="spike-alert">
      <div className="brief-header">
        <span className="spike-label">⚡ 스파이크 감지</span>
        <span className="brief-date">오늘 급증 종목</span>
      </div>
      <div className="spike-list">
        {spikes.slice(0, 5).map(({ stock, todayCnt, prevAvg, ratio }) => (
          <div key={stock} className="spike-row">
            <span className="spike-stock">{stock}</span>
            <span className="spike-cnt">오늘 {todayCnt}회</span>
            <span className="spike-arrow">↑</span>
            <span className="spike-ratio">
              {prevAvg === 0 ? '신규' : `${ratio.toFixed(1)}×`}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
