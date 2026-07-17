import { useState } from "react";

// 구 스키마(2026-07-17 이전) 폴백 렌더용 블록
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

// 신 스키마: 긍정/부정 한 단 — [산업] 그룹 → 종목 · 근거 1줄 (N명)
function PnColumn({ variant, title, groups, onStockClick }) {
  return (
    <div className={`report-block report-${variant}`}>
      <div className="report-block-title">{title}</div>
      {!groups?.length && <div className="pn-empty">해당 의견 없음</div>}
      {groups?.map((g) => (
        <div className="pn-sector" key={g.sector}>
          <div className="pn-sector-name">{g.sector}</div>
          {g.items.map((it, i) => (
            <div className="pn-item" key={it.name + i}>
              <span
                className="pn-name stock-tag-clickable"
                onClick={() => onStockClick?.(it.name)}
              >
                {it.name}
              </span>
              <span className="pn-point">
                {it.point}
                {it.mentions > 0 && <span className="pn-mentions"> ({it.mentions}명)</span>}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function DailyBrief({ briefs, onStockClick }) {
  // briefs: daily_briefs 배열(최신순). 단일 객체가 와도 배열로 정규화(하위호환).
  const list = (Array.isArray(briefs) ? briefs : briefs ? [briefs] : [])
    .filter((b) => b && (b.brief || b.positive || b.negative));
  const [idx, setIdx] = useState(0);
  if (list.length === 0) return null;

  const sel = Math.min(idx, list.length - 1);
  const brief = list[sel];
  const isNew = Array.isArray(brief.positive) || Array.isArray(brief.negative);
  const gen = brief.generatedAt
    ? new Date(brief.generatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })
    : null;

  return (
    <section className="daily-brief report">
      <div className="report-head">
        <div className="report-kicker-row">
          <span className="report-kicker">종합 리포트</span>
          {list.length > 1 && (
            <div className="report-dates">
              {list.map((b, i) => (
                <button
                  key={b.date + i}
                  className={`report-date-chip ${i === sel ? "active" : ""}`}
                  onClick={() => setIdx(i)}
                >
                  {i === 0 ? "최신" : b.date.slice(5)}
                </button>
              ))}
            </div>
          )}
        </div>
        <h2 className="report-headline">{brief.headline}</h2>
        <div className="report-meta">
          {brief.date} · 글 {brief.post_count}개 종합{gen && ` · ${gen} 기준`}
          {sel > 0 && <span className="report-past"> · 지난 리포트</span>}
        </div>
      </div>

      {isNew ? (
        <>
          {brief.minority?.length > 0 && (
            <div className="pn-minority">
              🔍 <b>다른 생각</b> — {brief.minority.join(" / ")}
            </div>
          )}
          <div className="report-grid">
            <PnColumn variant="bull" title="📈 긍정" groups={brief.positive} onStockClick={onStockClick} />
            <PnColumn variant="bear" title="📉 부정" groups={brief.negative} onStockClick={onStockClick} />
          </div>
        </>
      ) : (
        /* ── 구 스키마 폴백 (지난 리포트 열람용) ── */
        <>
          {brief.crowding && (
            <div className="report-crowding">⚠️ 쏠림 경고 — {brief.crowding}</div>
          )}
          <p className="report-summary">{brief.brief}</p>
          <div className="report-grid">
            <ReportBlock variant="bull" title="📈 강세 논거" items={brief.bull_case ?? brief.consensus} />
            <ReportBlock variant="bear" title="📉 약세·신중 논거" items={brief.bear_case ?? brief.divergence} />
          </div>
          <div className="report-grid">
            <ReportBlock variant="minority" title="🔍 소수·역발상" items={brief.minority} />
            <ReportBlock variant="watch" title="🎯 관전 포인트" items={brief.watch_points} />
          </div>
        </>
      )}
    </section>
  );
}
