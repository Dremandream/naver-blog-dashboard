// 오늘 시장 심리 요약: 섹터 분포 도넛 + 강세/약세/중립 비율 막대
const SECTOR_COLORS = [
  "#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#94a3b8",
];

export default function MarketPulse({ posts }) {
  if (!posts || posts.length === 0) return null;

  // 섹터 집계
  const sectorMap = {};
  for (const p of posts) sectorMap[p.sector] = (sectorMap[p.sector] || 0) + 1;
  const sectors = Object.entries(sectorMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const totalSector = sectors.reduce((s, x) => s + x.count, 0) || 1;

  // 도넛 conic-gradient 문자열
  let acc = 0;
  const stops = sectors.map((s, i) => {
    const start = (acc / totalSector) * 100;
    acc += s.count;
    const end = (acc / totalSector) * 100;
    return `${SECTOR_COLORS[i % SECTOR_COLORS.length]} ${start}% ${end}%`;
  });
  const donut = `conic-gradient(${stops.join(", ")})`;

  // 스탠스 집계
  const stance = { 강세: 0, 약세: 0, 중립: 0 };
  for (const p of posts) {
    if (p.stance === "강세") stance.강세 += 1;
    else if (p.stance === "약세") stance.약세 += 1;
    else stance.중립 += 1;
  }
  const totalStance = stance.강세 + stance.약세 + stance.중립 || 1;

  return (
    <section className="market-pulse">
      <div className="brief-header">
        <span className="brief-label">📊 오늘의 시장 심리</span>
        <span className="brief-date">글 {posts.length}개 기준</span>
      </div>

      <div className="mp-body">
        {/* 섹터 도넛 */}
        <div className="mp-block">
          <div className="mp-donut" style={{ background: donut }}>
            <div className="mp-donut-hole">
              <span className="mp-donut-num">{sectors.length}</span>
              <span className="mp-donut-label">섹터</span>
            </div>
          </div>
          <ul className="mp-legend">
            {sectors.map((s, i) => (
              <li key={s.name}>
                <span className="mp-dot" style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }} />
                {s.name} <b>{s.count}</b>
              </li>
            ))}
          </ul>
        </div>

        {/* 스탠스 비율 */}
        <div className="mp-block mp-stance">
          <div className="mp-stance-bar">
            <span className="mp-s mp-s-bull" style={{ width: `${(stance.강세 / totalStance) * 100}%` }} />
            <span className="mp-s mp-s-neutral" style={{ width: `${(stance.중립 / totalStance) * 100}%` }} />
            <span className="mp-s mp-s-bear" style={{ width: `${(stance.약세 / totalStance) * 100}%` }} />
          </div>
          <ul className="mp-stance-legend">
            <li><span className="mp-dot mp-d-bull" />강세 <b>{stance.강세}</b></li>
            <li><span className="mp-dot mp-d-neutral" />중립 <b>{stance.중립}</b></li>
            <li><span className="mp-dot mp-d-bear" />약세 <b>{stance.약세}</b></li>
          </ul>
        </div>
      </div>
    </section>
  );
}
