import { useMemo, useState } from 'react';
import { rankSources, selectRelatedPosts } from '../utils/source-ranking';

const MODES = [
  { value: '1y', label: '1년 적중률' },
  { value: 'combined', label: '종합 신뢰도' },
  { value: '3m', label: '3개월 적중률' },
];

function Cell({ w }) {
  if (!w) return <span className="ss-thin">—</span>;
  if (w.rate != null) {
    const cls = w.rate >= 60 ? 'ss-hit-good' : w.rate >= 40 ? 'ss-hit-mid' : 'ss-hit-low';
    return <span className={cls}>{w.rate}% <span className="ss-frac">· {w.total}건</span></span>;
  }
  if (w.total > 0) return <span className="ss-thin">표본 적음 ({w.total}건)</span>;
  return <span className="ss-thin">결과 대기</span>;
}

function RawRate({ source, window }) {
  const result = source.w?.[window?.n];
  return (
    <span>
      <b>{window?.label}</b> {result?.rate != null ? `${result.rate}% · ${result.total}건` : `표본 ${result?.total ?? 0}건`}
    </span>
  );
}

export default function SourceScores({ scores, posts = [], onSourceClick, onPostClick, compact = false }) {
  const [mode, setMode] = useState('1y');
  const sources = scores?.sources ?? [];
  const windows = scores?.windows ?? [];
  const ranked = useMemo(() => rankSources(scores, mode), [scores, mode]);
  const topSources = ranked.filter((source) => source.rankingScore != null).slice(0, 5);
  const related = useMemo(
    () => compact ? [] : selectRelatedPosts(ranked, posts, { referenceDate: scores?.asOf, topSources: 5, perSource: 2, days: 7 }),
    [compact, ranked, posts, scores?.asOf],
  );

  if (sources.length === 0 || windows.length === 0) return null;

  const min = scores.minSample;
  const coverage = scores.coverage;
  const backfill = scores.backfill;
  const first = windows[0];
  const last = windows[windows.length - 1];
  const allPending = sources.every((source) => windows.every((window) => (source.w?.[window.n]?.total ?? 0) === 0));

  return (
    <section className={`source-scores ${compact ? 'source-scores-compact' : ''}`} aria-labelledby="source-scores-title">
      <div className="brief-header ss-header">
        <span className="brief-label" id="source-scores-title">
          🎯 소스 실험 통계 <span className="at-sub">AI 방향 판정의 과거 지수 대비 결과</span>
        </span>
        {scores.asOf && <span className="brief-date">{scores.asOf} 기준</span>}
      </div>

      {!compact && (
        <div className="ss-lead">
          필자가 밝힌 강세·약세 의견을 게시 다음 거래일부터 시장 지수와 비교합니다.
          <b> 현재 글의 성공을 보장하는 점수나 매매 추천은 아닙니다.</b>
          {coverage && (
            <small className="ss-coverage">
              검증 이력 {coverage.historyStart}~{coverage.historyEnd} · 직접 의견 {coverage.eligibleMentions}건 → 독립 에피소드 {coverage.independentEpisodes}건
              {coverage.repeatedMentionsExcluded > 0 ? ` · 반복 ${coverage.repeatedMentionsExcluded}건 제외` : ''}
              {backfill?.status === 'partial' ? ` · 원문 재분석 일부 실패 ${backfill.failed}건` : ''}
            </small>
          )}
        </div>
      )}

      {!compact && (
        <div className="ss-mode-tabs" aria-label="소스 순위 기준">
          {MODES.map((item) => (
            <button
              className={`ss-mode ${mode === item.value ? 'active' : ''}`}
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {allPending ? (
        <div className="ss-pending">
          아직 판정된 의견이 없습니다. 의견을 낸 지 <b>{first.label}</b>이 지나면 결과가 채워집니다.
        </div>
      ) : (
        <div className="ss-top-grid">
          {topSources.map((source, index) => (
            <button className="ss-source-card" type="button" key={source.person} onClick={() => onSourceClick?.(source.person)}>
              <span className="ss-rank">{index + 1}</span>
              <span className="ss-card-person">{source.person}</span>
              <span className="ss-card-score">{source.rankingScore}<small> 보정점수</small></span>
              <span className="ss-card-rates">
                <RawRate source={source} window={first} />
                <RawRate source={source} window={last} />
              </span>
              <span className="ss-filter-hint">이 필자의 글만 보기 →</span>
            </button>
          ))}
        </div>
      )}

      {!compact && related.length > 0 && (
        <div className="ss-related">
          <div className="ss-related-title">상위 소스 최신 관련글 <span>최근 7일 · 소스별 최대 2개</span></div>
          {related.map((group) => (
            <div className="ss-related-group" key={group.person}>
              <button className="ss-related-person" type="button" onClick={() => onSourceClick?.(group.person)}>
                {group.person}
              </button>
              <div className="ss-related-posts">
                {group.posts.map((post) => (
                  <button className="ss-related-post" type="button" key={post.id} onClick={() => onPostClick?.(post)}>
                    <span>{post.title}</span>
                    <small>{post.date}{post.stocks?.[0] ? ` · ${post.stocks[0]}` : ''}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <details className="ss-all">
        <summary>전체 소스 성적표 보기</summary>
        <div className="ss-list">
          <div className="ss-row ss-head" aria-hidden="true">
            <span className="ss-name">소스</span>
            <span className="ss-col">의견</span>
            {windows.map((window) => <span className="ss-col" key={window.n}>{window.label} 후 적중</span>)}
          </div>
          {ranked.map((source) => (
            <button className="ss-row ss-row-button" type="button" key={source.person} onClick={() => onSourceClick?.(source.person)}>
              <span className="ss-name">{source.person}</span>
              <span className="ss-col ss-thin">{source.opinions}건</span>
              {windows.map((window) => <span className="ss-col" key={window.n}><Cell w={source.w?.[window.n]} /></span>)}
            </button>
          ))}
        </div>
      </details>

      {compact ? (
        <div className="ss-note">실험 통계입니다. 반복 의견은 7일 에피소드로 합치고 게시 다음 거래일부터 지수 대비 성과를 판정하며, 예측력이나 매매 성과를 뜻하지 않습니다.</div>
      ) : (
        <div className="ss-note">
          <b>보정점수</b>는 적중률과 표본 수를 함께 반영한 윌슨 하한입니다. 종합은 {first.label} 40%와 {last.label} 60%를 합산하며,
          표본 {min}건 미만은 순위 계산에서 제외합니다. 같은 인물·종목·방향의 7일 이내 반복은 한 에피소드로 묶으며, 원래 적중률과 판정 건수는 카드와 전체 성적표에서 함께 확인할 수 있습니다.
        </div>
      )}
    </section>
  );
}
