import { useEffect, useMemo, useState } from 'react';
import { buildOpinionConflicts, buildTodayDiscovery, buildWatchlistBrief, getSessionLabel } from '../utils/decision-dashboard';

const WATCHLIST = ['삼성전자', 'SK하이닉스'];
const USAGE_KEY = 'dashboard:usage:v1';
const TYPE_LABEL = { critical: '중대 변화', new: '완전 신규', resurfaced: '재부상' };

function kstTimeParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: value('hour'), minute: value('minute') };
}
function dateOffset(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function readUsage(referenceDate) {
  try {
    const usage = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}');
    const legacy = JSON.parse(localStorage.getItem(`dashboard:opened:${referenceDate}`) ?? '[]');
    if (legacy.length && !usage[referenceDate]?.opened?.length) {
      usage[referenceDate] = { ...(usage[referenceDate] ?? {}), opened: legacy };
    }
    return usage;
  } catch {
    return {};
  }
}

function trustLabel(trust) {
  if (trust?.rate == null) return '1년 검증 중';
  return `1년 ${trust.rate}% · ${trust.total}건`;
}

function evidenceText(item) {
  return item?.post?.reasoning || item?.post?.summary || item?.post?.title || '근거 없음';
}

function Evidence({ item, stance }) {
  if (!item) return <div className="dc-evidence dc-evidence-empty">최근 7일 {stance} 근거 없음</div>;
  return (
    <a className={`dc-evidence dc-${stance === '강세' ? 'bull' : 'bear'}`} href={item.post.url} target="_blank" rel="noreferrer">
      <span className="dc-evidence-side">{stance === '강세' ? '▲ 강세' : '▼ 약세'}</span>
      <span className="dc-evidence-copy">{evidenceText(item)}</span>
      <span className="dc-evidence-meta">
        {item.source} · {trustLabel(item.trust)}
        {item.direct === false && ' · 함께 언급(맥락 확인)'}
      </span>
    </a>
  );
}

function DiscoveryRow({ item, opened, onOpen }) {
  const directional = item.post.stance === '강세' || item.post.stance === '약세';
  return (
    <article className={`dc-discovery-row dc-type-${item.type} ${opened ? 'dc-row-opened' : ''}`}>
      <div className="dc-row-main">
        <div className="dc-row-labels">
          <span className="dc-type-label">{TYPE_LABEL[item.type]}</span>
          {directional && <span className={`dc-row-stance ${item.post.stance === '강세' ? 'bull' : 'bear'}`}>{item.post.stance}</span>}
        </div>
        <h3>{item.stock}</h3>
        <p className="dc-row-reason">{item.reason}</p>
        {item.catalyst && <p className="dc-row-catalyst"><b>촉매</b> {item.catalyst}</p>}
        <div className="dc-row-meta">
          {item.source} · {trustLabel(item.trust)} · {item.post.date}
          {item.sector && <span> · {item.sector}</span>}
        </div>
      </div>
      <a className="dc-row-link" href={item.post.url} target="_blank" rel="noreferrer" onClick={() => onOpen(item.post.id)}>
        {opened ? '✓ 다시 보기' : '원문 보기'} <span>→</span>
      </a>
    </article>
  );
}

export default function DecisionCockpit({ posts = [], scores, mentionHistory, verdicts, referenceDate, onStockClick }) {
  const time = kstTimeParts();
  const session = getSessionLabel(time.hour, time.minute);
  const discovery = useMemo(
    () => buildTodayDiscovery(posts, scores, mentionHistory, verdicts, {
      referenceDate, watchlist: WATCHLIST, newLimit: 2, resurfacedLimit: 1,
    }),
    [posts, scores, mentionHistory, verdicts, referenceDate],
  );
  const watchlist = useMemo(
    () => buildWatchlistBrief(posts, scores, WATCHLIST, { referenceDate, days: 7 }),
    [posts, scores, referenceDate],
  );
  const conflicts = useMemo(
    () => buildOpinionConflicts(posts, scores, { referenceDate, days: 7, limit: 3, excludeStocks: WATCHLIST }),
    [posts, scores, referenceDate],
  );
  const [usage, setUsage] = useState(() => readUsage(referenceDate));

  useEffect(() => {
    setUsage((current) => {
      const next = { ...current, [referenceDate]: { ...(current[referenceDate] ?? {}), visited: true, opened: current[referenceDate]?.opened ?? [] } };
      try { localStorage.setItem(USAGE_KEY, JSON.stringify(next)); } catch { /* 기기 내 표시만 유지 */ }
      return next;
    });
  }, [referenceDate]);

  const openedIds = new Set(usage[referenceDate]?.opened ?? []);
  const openedCount = discovery.items.filter((item) => openedIds.has(item.post.id)).length;
  const weekCutoff = dateOffset(referenceDate, -6);
  const weekEntries = Object.entries(usage).filter(([date]) => date >= weekCutoff && date <= referenceDate);
  const visitDays = weekEntries.filter(([, value]) => value.visited).length;
  const weekClicks = weekEntries.reduce((sum, [, value]) => sum + new Set(value.opened ?? []).size, 0);
  const selectionRatio = posts.length ? ((discovery.items.length / posts.length) * 100).toFixed(1) : '0.0';

  const markOpened = (postId) => {
    setUsage((current) => {
      const opened = new Set(current[referenceDate]?.opened ?? []);
      opened.add(postId);
      const next = { ...current, [referenceDate]: { ...(current[referenceDate] ?? {}), visited: true, opened: [...opened] } };
      try { localStorage.setItem(USAGE_KEY, JSON.stringify(next)); } catch { /* 기기 내 표시만 유지 */ }
      return next;
    });
  };

  return (
    <section className="decision-cockpit" aria-labelledby="decision-title">
      <div className="dc-app-header">
        <div>
          <span className="dc-kicker">Today · {session}</span>
          <h2 id="decision-title">오늘 새로 볼 것</h2>
          <p>중요한 변화만 최대 1+2+1로 선별합니다.</p>
        </div>
        <div className="dc-open-progress">원문 <b>{openedCount}/{discovery.items.length}</b> 확인</div>
      </div>

      <div className="dc-usage-strip" aria-label="대시보드 이용 현황">
        <span><b>{discovery.items.length}</b>/{posts.length}개 선별 <small>{selectionRatio}%</small></span>
        <span>최근 7일 <b>{visitDays}</b>일 이용</span>
        <span>원문 <b>{weekClicks}</b>회 열람</span>
      </div>

      <div className="dc-discovery-list">
        {discovery.items.length === 0 && (
          <div className="dc-empty">오늘은 기준을 충족한 중대 변화·신규·재부상 아이디어가 없습니다.</div>
        )}
        {discovery.items.map((item) => (
          <DiscoveryRow key={`${item.type}-${item.post.id}`} item={item} opened={openedIds.has(item.post.id)} onOpen={markOpened} />
        ))}
      </div>

      <div className="dc-lower-grid">
        <div className="dc-panel">
          <div className="dc-panel-title"><span>관심 종목</span><small>터치해 근거 펼치기</small></div>
          {watchlist.map((item) => (
            <details className="dc-watch" key={item.stock}>
              <summary className="dc-watch-summary">
                <b>{item.stock}</b><span>{item.count}건 · 강세·약세 근거 보기</span>
              </summary>
              <div className="dc-watch-body">
                <Evidence item={item.bull} stance="강세" />
                <Evidence item={item.bear} stance="약세" />
                <button type="button" className="dc-stock-report" onClick={() => onStockClick?.(item.stock)}>종목 리포트 열기 →</button>
              </div>
            </details>
          ))}
        </div>

        <div className="dc-panel">
          <div className="dc-panel-title"><span>의견 충돌</span><small>서로 다른 필자의 최강 근거</small></div>
          {conflicts.length === 0 && <div className="dc-empty">최근 7일 뚜렷한 강세·약세 충돌이 없습니다.</div>}
          {conflicts.map((item) => (
            <div className="dc-conflict" key={item.stock}>
              <button type="button" className="dc-stock-button" onClick={() => onStockClick?.(item.stock)}>
                {item.stock} <span>{item.sourceCount}개 방향성 소스 →</span>
              </button>
              <div className="dc-conflict-evidence">
                <Evidence item={item.bull} stance="강세" />
                <Evidence item={item.bear} stance="약세" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="dc-disclaimer">1년 적중률과 표본 수를 보정해 원문 우선순위를 정합니다. 매매 추천이 아니며, 클릭·이용 기록은 이 기기에만 저장됩니다.</p>
    </section>
  );
}
