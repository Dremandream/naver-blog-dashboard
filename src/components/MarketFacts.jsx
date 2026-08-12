import { useMemo } from 'react';
import { buildMarketFacts } from '../utils/market-facts';

function formatPercent(value) {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatFlow(value) {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('ko-KR')}억`;
}

function tone(value) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

function formatAsOf(value) {
  const text = String(value ?? '');
  return /^\d{8}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
    : text;
}

export default function MarketFacts({ market }) {
  const facts = useMemo(() => buildMarketFacts(market), [market]);
  if (!facts.indices.length) return null;

  return (
    <section className="market-facts" aria-labelledby="market-facts-title">
      <div className="market-facts-head">
        <div>
          <span className="home-kicker">Market Facts</span>
          <h2 id="market-facts-title">시장 정량 사실</h2>
        </div>
        <span>{formatAsOf(facts.asOf)} 기준</span>
      </div>

      <div className="market-facts-grid">
        {facts.indices.map((item) => (
          <article key={item.key}>
            <div className="market-facts-index">
              <b>{item.label}</b>
              <strong>{item.index.toLocaleString('ko-KR')}</strong>
            </div>
            <dl>
              <div><dt>1일</dt><dd className={tone(item.d1)}>{formatPercent(item.d1)}</dd></div>
              <div><dt>5일</dt><dd className={tone(item.d5)}>{formatPercent(item.d5)}</dd></div>
              <div><dt>20일</dt><dd className={tone(item.d20)}>{formatPercent(item.d20)}</dd></div>
              <div><dt>외국인</dt><dd className={tone(item.foreign)}>{formatFlow(item.foreign)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      <p className="market-facts-note">
        지수·수급은 사실 데이터이며 블로거 의견과 분리합니다.
        {facts.divergent && ' KOSPI와 KOSDAQ의 5일 방향이 엇갈립니다.'}
      </p>
    </section>
  );
}
