import { useMemo } from 'react';
import DecisionCockpit from './DecisionCockpit';
import DailyBrief from './DailyBrief';
import PeterFearGreed from './PeterFearGreed';
import SemiconductorPulse from './SemiconductorPulse';
import AttentionTrends from './AttentionTrends';
import SourceScores from './SourceScores';
import MarketFacts from './MarketFacts';
import { buildHomeBrief } from '../utils/personal-home';

function SignalLine({ label, item, variant }) {
  if (!item) return null;
  return (
    <div className={`home-signal home-signal-${variant}`}>
      <span>{label}</span>
      <b>{item.name}</b>
      <p>{item.point}</p>
    </div>
  );
}

export default function PersonalHome({ data, posts, peterFearGreed, onStockClick, onSourceClick, onPostClick }) {
  const brief = useMemo(
    () => buildHomeBrief(data?.daily_briefs ?? data?.daily_brief),
    [data?.daily_briefs, data?.daily_brief],
  );

  return (
    <div className="personal-home">
      <div className="home-primary-grid">
        <section className="home-hero" aria-labelledby="home-brief-title">
          <div className="home-hero-head">
            <div>
              <span className="home-kicker">My Daily Brief · {brief.date || data?.date}</span>
              <h2 id="home-brief-title">오늘의 종합판단</h2>
            </div>
          </div>
          <p className="home-headline">{brief.headline}</p>
          <div className="home-signal-grid">
            <SignalLine label="주도" item={brief.positive} variant="positive" />
            <SignalLine label="리스크" item={brief.risk} variant="risk" />
            {brief.minority && (
              <div className="home-signal home-signal-minority">
                <span>다른 생각</span>
                <p>{brief.minority}</p>
              </div>
            )}
          </div>
        </section>

        <aside className="home-pfg-panel" aria-label="Peter K Fear & Greed">
          <PeterFearGreed data={peterFearGreed} />
        </aside>
      </div>

      <MarketFacts
        market={data?.market}
        prices={data?.prices}
        posts={posts}
        referenceDate={data?.date}
      />

      <DecisionCockpit
        posts={posts}
        scores={data?.source_scores}
        referenceDate={data?.date}
        onStockClick={onStockClick}
        compact
      />

      <SourceScores
        scores={data?.source_scores}
        posts={posts}
        onSourceClick={onSourceClick}
        onPostClick={onPostClick}
        compact
      />

      <details className="home-market-details">
        <summary>
          <span>상세 시황·반대 의견 보기</span>
          <small>종합 논거 · 어제와의 변화 · 반도체 펄스 · 종목 관심 추이</small>
        </summary>
        <div className="home-market-details-body">
          <DailyBrief
            briefs={data?.daily_briefs ?? data?.daily_brief}
            posts={posts}
            scores={data?.source_scores}
            onStockClick={onStockClick}
          />

          <section className="home-changes" aria-labelledby="home-changes-title">
            <div className="home-section-head">
              <div>
                <span className="home-kicker">Since Yesterday</span>
                <h2 id="home-changes-title">어제와 달라진 것</h2>
              </div>
              <span className={`home-change-status ${brief.changes.length ? 'active' : ''}`}>{brief.comparisonStatus}</span>
            </div>
            {brief.changes.length ? (
              <div className="home-change-list">
                {brief.changes.map((item) => (
                  <article key={`${item.type}-${item.name}`}>
                    <span className={`home-change-type ${item.type === '시각 전환' ? 'switch' : ''}`}>{item.type}</span>
                    <div>
                      <b>{item.name}</b>
                      <p>{item.point}</p>
                      <small>{item.sector} · {item.stance}{item.mentions > 0 && ` · ${item.mentions}명 언급`}</small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="home-no-change">비교 가능한 리포트에서 새로 등장하거나 방향이 바뀐 핵심 주제를 찾지 못했습니다.</p>
            )}
          </section>

          <SemiconductorPulse posts={posts} referenceDate={data?.date} onStockClick={onStockClick} />
          <AttentionTrends posts={posts} prices={data?.prices} verdicts={data?.verdicts} onStockClick={onStockClick} />
        </div>
      </details>
    </div>
  );
}
