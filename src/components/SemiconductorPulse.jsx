import { useMemo } from 'react';
import { buildSemiconductorPulse } from '../utils/semiconductor-pulse';

const TONE_CLASS = {
  '강세 우세': 'sp-tone-bull',
  '약세 우세': 'sp-tone-bear',
  '혼조': 'sp-tone-mixed',
  '방향성 부족': 'sp-tone-neutral',
  '데이터 부족': 'sp-tone-neutral',
};

export default function SemiconductorPulse({ posts = [], referenceDate, onStockClick }) {
  const pulse = useMemo(
    () => buildSemiconductorPulse(posts, { referenceDate, days: 2, stockLimit: 5, catalystLimit: 3 }),
    [posts, referenceDate],
  );
  const directionalTotal = pulse.stances.bull + pulse.stances.bear;
  const bullWidth = directionalTotal ? (pulse.stances.bull / directionalTotal) * 100 : 0;

  return (
    <section className="semiconductor-pulse" aria-labelledby="semiconductor-pulse-title">
      <div className="sp-head">
        <div>
          <span className="sp-kicker">Semiconductor Lens · 최근 2일</span>
          <h2 id="semiconductor-pulse-title">반도체 데일리 펄스</h2>
        </div>
        <span className={`sp-tone ${TONE_CLASS[pulse.tone] ?? 'sp-tone-neutral'}`}>{pulse.tone}</span>
      </div>

      {pulse.postCount === 0 ? (
        <p className="sp-empty">최근 2일 수집 글에서 반도체 관련 시황을 찾지 못했습니다.</p>
      ) : (
        <>
          <p className="sp-lead">
            반도체 관련 <b>{pulse.postCount}건</b> · <b>{pulse.sourceCount}명</b>의 시각
            {pulse.marketViewCount > 0 && <> · 시장 전체 관점 <b>{pulse.marketViewCount}건</b></>}
          </p>
          <div className="sp-grid">
            <div className="sp-sentiment">
              <div className="sp-block-title">오늘의 강약</div>
              <div className="sp-split-labels">
                <span className="sp-bull">▲ 강세 {pulse.stances.bull}</span>
                <span>중립 {pulse.stances.neutral}</span>
                <span className="sp-bear">▼ 약세 {pulse.stances.bear}</span>
              </div>
              <div className="sp-bar" aria-label={`강세 ${pulse.stances.bull}건, 약세 ${pulse.stances.bear}건`}>
                {directionalTotal === 0 ? (
                  <span className="sp-bar-neutral" />
                ) : (
                  <>
                    <span className="sp-bar-bull" style={{ width: `${bullWidth}%` }} />
                    <span className="sp-bar-bear" style={{ width: `${100 - bullWidth}%` }} />
                  </>
                )}
              </div>
              <div className="sp-block-title sp-stocks-title">많이 언급된 종목</div>
              <div className="sp-stocks">
                {pulse.topStocks.length === 0 && <span className="sp-muted">종목 언급 없음</span>}
                {pulse.topStocks.map((stock) => (
                  <button type="button" key={stock.name} onClick={() => onStockClick?.(stock.name)}>
                    {stock.name} <small>{stock.count}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="sp-catalysts">
              <div className="sp-block-title">새로 확인된 촉매</div>
              {pulse.catalysts.length === 0 && <p className="sp-muted">구체적으로 새로 확인된 촉매가 없습니다.</p>}
              {pulse.catalysts.map((item) => (
                <a href={item.url} target="_blank" rel="noreferrer" key={`${item.url}-${item.text}`}>
                  <span>{item.text}</span>
                  <small>{item.source}{item.stock && ` · ${item.stock}`} · {item.date}</small>
                </a>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
