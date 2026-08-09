import { useMemo, useState } from 'react';
import { buildOpinionConflicts, buildWatchlistBrief, getSessionLabel, selectNewIdeas } from '../utils/decision-dashboard';

const WATCHLIST = ['삼성전자', 'SK하이닉스'];

function kstTimeParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const value = (type) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { hour: value('hour'), minute: value('minute') };
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

export default function DecisionCockpit({ posts = [], scores, referenceDate, onStockClick }) {
  const time = kstTimeParts();
  const session = getSessionLabel(time.hour, time.minute);
  const ideas = useMemo(
    () => selectNewIdeas(posts, scores, { referenceDate, watchlist: WATCHLIST, limit: 3, days: 2 }),
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
  const storageKey = `dashboard:opened:${referenceDate ?? 'unknown'}`;
  const [openedIds, setOpenedIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storageKey) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const openedCount = ideas.filter((item) => openedIds.has(item.post.id)).length;
  const markOpened = (postId) => {
    setOpenedIds((current) => {
      const next = new Set(current).add(postId);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // 저장이 제한된 브라우저에서도 현재 화면의 확인 표시는 유지한다.
      }
      return next;
    });
  };

  return (
    <section className="decision-cockpit" aria-labelledby="decision-title">
      <div className="dc-header">
        <div>
          <span className="dc-kicker">Decision Cockpit · {session}</span>
          <h2 id="decision-title">오늘의 원문 선별</h2>
          <p>
            전체 {posts.length}개 글에서 지금 먼저 볼 투자 아이디어 {ideas.length}개
            <strong className="dc-progress">원문 {openedCount}/{ideas.length} 확인</strong>
          </p>
        </div>
        <span className="dc-time">{referenceDate} 기준</span>
      </div>

      <div className="dc-ideas" aria-label="우선 확인할 투자 아이디어">
        {ideas.length === 0 && <div className="dc-empty">최근 2일 내 선별할 신규 투자 아이디어가 없습니다.</div>}
        {ideas.map((item, index) => (
          <article className={`dc-idea ${openedIds.has(item.post.id) ? 'dc-idea-opened' : ''}`} key={item.post.id}>
            <div className="dc-idea-top">
              <span className="dc-rank">0{index + 1}</span>
              <span className={`dc-stance dc-stance-${item.post.stance === '강세' ? 'bull' : item.post.stance === '약세' ? 'bear' : 'neutral'}`}>
                {item.post.stance || '중립'}
              </span>
            </div>
            <h3>{item.idea}</h3>
            <div className="dc-source">{item.source} · {trustLabel(item.trust)}</div>
            <p>{evidenceText(item)}</p>
            <a className="dc-original" href={item.post.url} target="_blank" rel="noreferrer" onClick={() => markOpened(item.post.id)}>
              {openedIds.has(item.post.id) ? '✓ 열어본 원문 다시 보기 →' : '원문 열기 →'}
            </a>
          </article>
        ))}
      </div>

      <div className="dc-lower-grid">
        <div className="dc-panel">
          <div className="dc-panel-title">
            <span>관심 종목</span>
            <small>최근 7일 근거</small>
          </div>
          {watchlist.map((item) => (
            <div className="dc-watch" key={item.stock}>
              <button type="button" className="dc-stock-button" onClick={() => onStockClick?.(item.stock)}>
                {item.stock} <span>{item.count}건 · 종목 리포트 →</span>
              </button>
              <Evidence item={item.bull} stance="강세" />
              <Evidence item={item.bear} stance="약세" />
            </div>
          ))}
        </div>

        <div className="dc-panel">
          <div className="dc-panel-title">
            <span>의견 충돌</span>
            <small>양쪽의 가장 강한 근거</small>
          </div>
          {conflicts.length === 0 && <div className="dc-empty">최근 7일 뚜렷한 강세·약세 충돌이 없습니다.</div>}
          {conflicts.map((item) => (
            <div className="dc-conflict" key={item.stock}>
              <button type="button" className="dc-stock-button" onClick={() => onStockClick?.(item.stock)}>
                {item.stock} <span>{item.sourceCount}개 소스 비교 →</span>
              </button>
              <Evidence item={item.bull} stance="강세" />
              <Evidence item={item.bear} stance="약세" />
            </div>
          ))}
        </div>
      </div>

      <p className="dc-disclaimer">선별 순서는 종목 의견의 1년 적중 기록을 표본 수로 보정해 적용합니다. 매매 추천이 아니라 읽을 원문의 우선순위입니다.</p>
    </section>
  );
}
