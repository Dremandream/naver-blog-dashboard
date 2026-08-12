import { useMemo } from 'react';
import { buildMarketFacts } from '../utils/market-facts';

function formatPercent(value) {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

function formatMarketFlow(value) {
  if (value == null) return '—';
  return `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('ko-KR')}억`;
}

function formatShareFlow(value) {
  if (value == null) return '—';
  const tenThousands = Math.round(value / 10000);
  return `${value > 0 ? '+' : ''}${tenThousands.toLocaleString('ko-KR')}만주`;
}

function tone(value) {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

function formatAsOf(value) {
  const text = String(value ?? '').replace(/-/g, '');
  return /^\d{8}$/.test(text)
    ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
    : text;
}

function IndexCard({ item }) {
  return (
    <article>
      <div className="market-facts-index">
        <b>{item.label}</b>
        <strong>{item.index.toLocaleString('ko-KR')}</strong>
      </div>
      <dl>
        <div><dt>1일</dt><dd className={tone(item.d1)}>{formatPercent(item.d1)}</dd></div>
        <div><dt>5일</dt><dd className={tone(item.d5)}>{formatPercent(item.d5)}</dd></div>
        {item.d20 != null && <div><dt>20일</dt><dd className={tone(item.d20)}>{formatPercent(item.d20)}</dd></div>}
        {item.foreign != null && <div><dt>외국인</dt><dd className={tone(item.foreign)}>{formatMarketFlow(item.foreign)}</dd></div>}
      </dl>
    </article>
  );
}

export default function MarketFacts({ market, prices, posts, referenceDate }) {
  const facts = useMemo(
    () => buildMarketFacts(market, prices, posts, { referenceDate }),
    [market, prices, posts, referenceDate],
  );
  if (!facts.indices.length && !facts.globalIndices.length && !facts.watchlist.length) return null;

  return (
    <section className="market-facts" aria-labelledby="market-facts-title">
      <div className="market-facts-head">
        <div>
          <span className="home-kicker">Watchlist Facts</span>
          <h2 id="market-facts-title">관심 종목 객관 데이터</h2>
        </div>
        <span>{formatAsOf(facts.asOf)} 기준</span>
      </div>

      {facts.watchlist.length > 0 && (
        <div className="watchlist-facts-grid">
          {facts.watchlist.map((item) => (
            <article className="watchlist-fact-card" key={item.name}>
              <div className="watchlist-fact-title">
                <div><b>{item.name}</b><strong>{item.price.toLocaleString('ko-KR')}원</strong></div>
                {(item.stale || item.asOfMismatch) && <span>{item.stale ? '데이터 지연' : '기준일 차이'}</span>}
              </div>
              <dl className="watchlist-return-grid">
                <div><dt>1일</dt><dd className={tone(item.d1)}>{formatPercent(item.d1)}</dd></div>
                <div><dt>5일</dt><dd className={tone(item.d5)}>{formatPercent(item.d5)}</dd></div>
                <div><dt>20일</dt><dd className={tone(item.d20)}>{formatPercent(item.d20)}</dd></div>
                <div><dt>KOSPI 대비 20일</dt><dd className={tone(item.relative20d)}>{formatPercent(item.relative20d)}</dd></div>
              </dl>
              <div className="watchlist-flow-row">
                <span>외국인 당일 <b className={tone(item.investor?.foreignToday)}>{formatShareFlow(item.investor?.foreignToday)}</b></span>
                <span>외국인 5일 <b className={tone(item.investor?.foreign5d)}>{formatShareFlow(item.investor?.foreign5d)}</b></span>
                <span>기관 5일 <b className={tone(item.investor?.institution5d)}>{formatShareFlow(item.investor?.institution5d)}</b></span>
              </div>
              <p className="watchlist-opinions">독립 의견: 강세 {item.opinions.bull}명 · 약세 {item.opinions.bear}명</p>
              {item.alerts.length > 0 && (
                <ul className="watchlist-alerts">
                  {item.alerts.map((alert) => <li key={alert}>추가 확인 · {alert}</li>)}
                </ul>
              )}
              <small>가격 {formatAsOf(item.asOf)} · 수급 {formatAsOf(item.investor?.asOf) || '수집 대기'}</small>
            </article>
          ))}
        </div>
      )}

      {(facts.indices.length > 0 || facts.globalIndices.length > 0) && (
        <div className="market-environment">
          <h3>시장 환경</h3>
          <div className="market-facts-grid">
            {[...facts.indices, ...facts.globalIndices].map((item) => <IndexCard key={item.key} item={item} />)}
          </div>
        </div>
      )}

      <p className="market-facts-note">
        가격: 한국주식데이터·네이버 증권 · 수급: 네이버 증권. 블로거 의견과 분리한 참고 자료이며 매매 신호가 아닙니다.
        {facts.divergent && ' KOSPI와 KOSDAQ의 5일 방향이 엇갈립니다.'}
      </p>
    </section>
  );
}
