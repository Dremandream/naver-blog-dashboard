export default function DailyBrief({ brief, onStockClick }) {
  if (!brief || !brief.brief) return null;

  return (
    <section className="daily-brief">
      <div className="brief-header">
        <span className="brief-label">📰 오늘의 브리핑</span>
        <span className="brief-date">{brief.date} · 글 {brief.post_count}개 종합{brief.generatedAt && <span style={{fontSize:'11px',color:'#aaa',marginLeft:'8px'}}>{new Date(brief.generatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} 기준</span>}</span>
      </div>

      <p className="brief-headline">{brief.headline}</p>
      <p className="brief-body">{brief.brief}</p>

      {brief.consensus?.length > 0 && (
        <div className="brief-row">
          <span className="brief-tag brief-tag-consensus">합의</span>
          <ul className="brief-list">
            {brief.consensus.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        </div>
      )}

      {brief.divergence?.length > 0 && (
        <div className="brief-row">
          <span className="brief-tag brief-tag-divergence">이견</span>
          <ul className="brief-list">
            {brief.divergence.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}

      {brief.hot_stocks?.length > 0 && (
        <div className="brief-row brief-stocks">
          <span className="brief-tag brief-tag-hot">공통 언급</span>
          <div className="card-stocks" style={{flexWrap:'wrap'}}>
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
