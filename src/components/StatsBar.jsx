export default function StatsBar({ total, counts }) {
  return (
    <div className="stats-bar">
      <div className="stat-item">
        <span className="stat-num">{total}</span>
        <span className="stat-label">전체 글</span>
      </div>
      <div className="stat-divider" />
      <div className="stat-item buy">
        <span className="stat-num">{counts.매수}</span>
        <span className="stat-label">매수</span>
      </div>
      <div className="stat-item neutral">
        <span className="stat-num">{counts.중립}</span>
        <span className="stat-label">중립</span>
      </div>
      <div className="stat-item sell">
        <span className="stat-num">{counts.매도}</span>
        <span className="stat-label">매도</span>
      </div>
    </div>
  );
}
