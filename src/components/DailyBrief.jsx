// 종합의견 리포트 — 증권사 리포트 톤(결론 → 요약 → 강세/약세 논거 → 소수 → 관전포인트 → 종목)
function ReportBlock({ variant, title, items }) {
  if (!items?.length) return null;
  return (
    <div className={`report-block report-${variant}`}>
      <div className="report-block-title">{title}</div>
      <ul className="report-list">
        {items.map((t, i) => <li key={i}>{t}</li>)}
      </ul>
    </div>
  );
}

export default function DailyBrief({ brief, onStockClick }) {
  if (!brief || !brief.brief) return null;

  // 신규 스키마(bull_case/bear_case) 우선, 없으면 구 스키마(consensus/divergence) 폴백
  const bull = brief.bull_case ?? brief.consensus;
  const bear = brief.bear_case ?? brief.divergence;
  const gen = brief.generatedAt
    ? new Date(brief.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : null;

  return (
    <section className="daily-brief report">
      <div className="report-head">
        <div className="report-kicker">종합 리포트</div>
        <h2 className="report-headline">{brief.headline}</h2>
        <div className="report-meta">
          {brief.date} · 글 {brief.post_count}개 종합{gen && ` · ${gen} 기준`}
        </div>
      </div>

      <p className="report-summary">{brief.brief}</p>

      <div className="report-grid">
        <ReportBlock variant="bull" title="📈 강세 논거" items={bull} />
        <ReportBlock variant="bear" title="📉 약세·신중 논거" items={bear} />
      </div>

      <ReportBlock variant="minority" title="🔍 소수·역발상 의견" items={brief.minority} />
      <ReportBlock variant="price" title="⚖️ 말 vs 가격" items={brief.price_check} />
      <ReportBlock variant="watch" title="🎯 관전 포인트" items={brief.watch_points} />

      {brief.hot_stocks?.length > 0 && (
        <div className="report-block report-stocks">
          <div className="report-block-title">함께 주목한 종목</div>
          <div className="card-stocks" style={{ flexWrap: "wrap" }}>
            {brief.hot_stocks.map((s) => (
              <span
                key={s}
                className="stock-tag stock-tag-clickable"
                onClick={() => onStockClick?.(s)}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
