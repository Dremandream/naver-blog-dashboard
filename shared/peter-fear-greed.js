const MARKET_WORDS = /시장|증시|코스피|코스닥|지수|주도주|수급|유동성|상승장|하락장|조정장|고점|저점|바닥|랠리/;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isPeter(post) {
  return post?.person === '피터케이' || post?.blog_name === '피터케이' || post?.blog_id === 'luy1978';
}

function isMarketView(post) {
  if (typeof post.market_view === 'boolean') return post.market_view;
  const text = [post.title, post.summary, post.reasoning].filter(Boolean).join(' ');
  return post.sector === '거시경제' || MARKET_WORDS.test(text);
}

function sentimentOf(post) {
  if (Number.isFinite(post.market_sentiment)) return clamp(Number(post.market_sentiment), -2, 2);
  if (post.stance === '강세') return 1;
  if (post.stance === '약세') return -1;
  return 0;
}

function labelOf(score) {
  if (score <= 20) return '극단적 공포';
  if (score <= 40) return '공포';
  if (score < 60) return '중립';
  if (score < 80) return '탐욕';
  return '극단적 탐욕';
}

function interpretationOf(score) {
  if (score <= 20) return '공포 극단 — 과거 저점과 겹치는지 관찰';
  if (score <= 40) return '공포 우세 — 주도주와 수급 회복 여부 관찰';
  if (score < 60) return '방향성 중립 — 다음 시장 관점 확인';
  if (score < 80) return '낙관 우세 — 과열 전환 여부 관찰';
  return '낙관 극단 — 과열과 추격 위험 관찰';
}

export function buildPeterFearGreed(posts = [], { referenceDate } = {}) {
  const asOf = referenceDate || posts.map(p => p.date).filter(Boolean).sort().at(-1);
  if (!asOf) return { score: null, label: '데이터 부족', postCount: 0, dayCount: 0, evidence: [] };

  const end = new Date(`${asOf}T00:00:00Z`).getTime();
  const eligible = posts
    .filter(isPeter)
    .filter(isMarketView)
    .map(post => {
      const time = new Date(`${post.date}T00:00:00Z`).getTime();
      const ageDays = Math.round((end - time) / 86400000);
      return { post, ageDays, sentiment: sentimentOf(post) };
    })
    .filter(x => x.ageDays >= 0 && x.ageDays < 7)
    .sort((a, b) => b.post.date.localeCompare(a.post.date));

  if (eligible.length === 0) {
    return { score: null, label: '데이터 부족', asOf, postCount: 0, dayCount: 0, evidence: [] };
  }

  let weighted = 0;
  let weights = 0;
  for (const item of eligible) {
    const weight = 7 - item.ageDays;
    weighted += item.sentiment * weight;
    weights += weight;
  }
  const score = Math.round(clamp(50 + 25 * (weighted / weights), 0, 100));
  const explicitCount = eligible.filter(x => Number.isFinite(x.post.market_sentiment)).length;
  const confidence = explicitCount >= 5 ? '보통' : eligible.length >= 3 ? '낮음' : '매우 낮음';

  return {
    score,
    label: labelOf(score),
    interpretation: interpretationOf(score),
    asOf: eligible[0].post.date,
    postCount: eligible.length,
    dayCount: new Set(eligible.map(x => x.post.date)).size,
    confidence,
    beta: true,
    evidence: eligible.slice(0, 3).map(({ post, sentiment }) => ({
      id: post.id,
      date: post.date,
      title: post.title,
      sentiment,
      reason: post.market_reason || post.reasoning || post.summary || '',
    })),
  };
}
