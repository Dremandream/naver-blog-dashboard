export default function StatsBar({ total, sectors }) {
  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-num">{total}</span>
        <span className="stat-label">전체 글</span>
      </div>
      {Object.entries(sectors).map(([sector, count]) => (
        count > 0 && (
          <span key={sector} className="stat-sector-chip">
            {sector} {count}
          </span>
        )
      ))}
    </div>
  );
}
