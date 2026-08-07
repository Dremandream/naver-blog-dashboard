// 팩트 사이드바 — 증권사 리포트 우측 데이터 컬럼 (본문=주장, 사이드바=검증 데이터)
import EventCalendar, { mergeEvents } from "./EventCalendar";
import PeterFearGreed from "./PeterFearGreed";
function Pct({ v }) {
  if (v == null) return null;
  const cls = v > 0 ? "at-px-up" : v < 0 ? "at-px-down" : "at-px-flat";
  return <span className={cls}>{v > 0 ? "+" : ""}{v}%</span>;
}

export default function FactSidebar({ peterFearGreed, verdicts, dailyBriefs, onStockClick }) {
  const review = (verdicts?.items ?? []).filter((it) => it.verdict === "needs_review");
  const hasEvents = mergeEvents(dailyBriefs).length > 0;
  if (!peterFearGreed && review.length === 0 && !hasEvents) return null;

  return (
    <aside className="fact-sidebar">
      <PeterFearGreed data={peterFearGreed} />
      {review.length > 0 && (
        <div className="fs-section">
          <div className="fs-title">⚖️ 여론·주가 역행 감지</div>
          {review.map((it) => (
            <div className="fs-row" key={it.ticker}>
              <span
                className="fs-name stock-tag-clickable"
                onClick={() => onStockClick?.(it.ticker)}
              >
                {it.ticker}
              </span>
              <span className="fs-val fs-review">
                여론 {it.DIR === "bull" ? "강세" : it.DIR === "bear" ? "약세" : "혼재"} vs 5일 <Pct v={it.P5} />
              </span>
            </div>
          ))}
          <div className="fs-note">여론 방향과 주가가 반대인 종목 — 해석 주의</div>
        </div>
      )}
      <EventCalendar dailyBriefs={dailyBriefs} onStockClick={onStockClick} />
    </aside>
  );
}
