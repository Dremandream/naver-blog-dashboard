import { uniqueStrings } from "../utils/post-list";

// 촉매 캘린더 — 7일치 브리핑의 events를 병합해 다가오는 일정을 날짜순 리스트로
function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 라벨 유사 중복 제거용: 공백 제거 후 앞 10자 비교
function labelKey(ev) {
  return `${ev.date}|${ev.label.replace(/\s/g, "").slice(0, 10)}`;
}

export function mergeEvents(dailyBriefs) {
  const today = todayKST();
  const seen = new Set();
  const out = [];
  for (const b of dailyBriefs || []) {
    for (const ev of b?.events || []) {
      if (!ev?.date || ev.date < today) continue;
      const k = labelKey(ev);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ev);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function fmtDate(d, approx) {
  const [, m, day] = d.split("-");
  return `${Number(m)}.${day}${approx ? "경" : ""}`;
}

export default function EventCalendar({ dailyBriefs, onStockClick }) {
  const events = mergeEvents(dailyBriefs);
  if (events.length === 0) return null;

  return (
    <div className="fs-section">
      <div className="fs-title">📅 주요 일정</div>
      {events.map((ev) => (
        <div className="fs-event" key={labelKey(ev)}>
          <span className="fs-event-date">{fmtDate(ev.date, ev.approx)}</span>
          <span className="fs-event-body">
            {ev.label}
            {uniqueStrings(ev.stocks).map((s) => (
              <span
                key={s}
                className="fs-event-stock stock-tag-clickable"
                onClick={() => onStockClick?.(s)}
              >
                {s}
              </span>
            ))}
          </span>
        </div>
      ))}
      <div className="fs-note">필자들이 언급한 예정 이벤트 — 날짜는 언급 기준</div>
    </div>
  );
}
