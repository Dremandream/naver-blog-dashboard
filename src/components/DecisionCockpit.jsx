import { useEffect, useMemo, useState } from 'react';
import { buildOpinionConflicts, buildWatchlistBrief, getSessionLabel } from '../utils/decision-dashboard';
import { selectMustReadPosts } from '../utils/must-read';

const WATCHLIST = ['삼성전자', 'SK하이닉스'];
const PREFERRED_SECTORS = ['반도체'];
const USAGE_KEY = 'dashboard:usage:v1';

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

function evidenceLabel(value) {
  return ['근거 미확인', '주장 중심', '근거 있음', '근거 풍부'][value] ?? '근거 미확인';
}

function MustReadCard({ item, rank, opened, onOpen }) {
  const directional = item.post.stance === '강세' || item.post.stance === '약세';
  return (
    <article className={`must-read-card ${rank === 1 ? 'must-read-featured' : ''} ${opened ? 'dc-row-opened' : ''}`}>
      <div className="must-read-rank"><span>{rank}</span><small>Pick</small></div>
      <div className="must-read-main">
        <div className="must-read-labels">
          {item.watchlistHit && <span className="must-read-watch">관심 종목</span>}
          {item.preferredSectorHit && <span className="must-read-sector">반도체 포커스</span>}
          {item.marketView && <span className="must-read-market">시장 시황</span>}
          {item.post.catalyst && <span className="must-read-catalyst-tag">새 촉매</span>}
          {directional && <span className={`dc-row-stance ${item.post.stance === '강세' ? 'bull' : 'bear'}`}>{item.post.stance}</span>}
        </div>
        <h3>{item.post.title}</h3>
        <p className="must-read-why"><b>왜 읽어야 하나</b> {item.whyRead}</p>
        <div className="must-read-meta">
          <span>{item.source}</span>
          <span>{trustLabel(item.trust)}</span>
          <span>{item.depthLabel}</span>
          <span>{evidenceLabel(item.evidenceQuality)}</span>
          <span>{item.post.date}</span>
        </div>
      </div>
      <a className="must-read-link" href={item.post.url} target="_blank" rel="noreferrer" onClick={() => onOpen(item.post.id)}>
        {opened ? '✓ 다시 보기' : '원문 보기'} <span>→</span>
      </a>
    </article>
  );
}

export default function DecisionCockpit({ posts = [], scores, referenceDate, onStockClick }) {
  const time = kstTimeParts();
  const session = getSessionLabel(time.hour, time.minute);
  const mustReads = useMemo(
    () => selectMustReadPosts(posts, scores, {
      referenceDate, watchlist: WATCHLIST, preferredSectors: PREFERRED_SECTORS, limit: 3, days: 2,
    }),
    [posts, scores, referenceDate],
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
  const openedCount = mustReads.filter((item) => openedIds.has(item.post.id)).length;
  const weekCutoff = dateOffset(referenceDate, -6);
  const weekEntries = Object.entries(usage).filter(([date]) => date >= weekCutoff && date <= referenceDate);
  const visitDays = weekEntries.filter(([, value]) => value.visited).length;
  const weekClicks = weekEntries.reduce((sum, [, value]) => sum + new Set(value.opened ?? []).size, 0);
  const selectionRatio = posts.length ? ((mustReads.length / posts.length) * 100).toFixed(1) : '0.0';

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
          <h2 id="decision-title">오늘 꼭 읽을 글</h2>
          <p>반도체 시황·관심 종목·새 촉매·근거 수준을 함께 평가한 3개입니다.</p>
        </div>
        <div className="dc-open-progress">원문 <b>{openedCount}/{mustReads.length}</b> 확인</div>
      </div>

      <div className="dc-usage-strip" aria-label="대시보드 이용 현황">
        <span><b>{mustReads.length}</b>/{posts.length}개 선별 <small>{selectionRatio}%</small></span>
        <span>최근 7일 <b>{visitDays}</b>일 이용</span>
        <span>원문 <b>{weekClicks}</b>회 열람</span>
      </div>

      <div className="must-read-list">
        {mustReads.length === 0 && (
          <div className="dc-empty">최근 2일 글 중 원문을 우선 추천할 만한 투자 글이 없습니다.</div>
        )}
        {mustReads.map((item, index) => (
          <MustReadCard key={item.post.id} item={item} rank={index + 1} opened={openedIds.has(item.post.id)} onOpen={markOpened} />
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

      <p className="dc-disclaimer">추천 순서는 반도체·시장 시황·관심 종목·새 촉매·근거 수준·본문 확보 범위·1년 소스 신뢰도를 함께 반영합니다. 매매 추천이 아니며, 클릭·이용 기록은 이 기기에만 저장됩니다.</p>
    </section>
  );
}
