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
  if (Number.isFinite(post.sentiment)) return clamp(Number(post.sentiment), -2, 2);
  if (Number.isFinite(post.market_sentiment)) return clamp(Number(post.market_sentiment), -2, 2);
  if (post.stance === '강세') return 1;
  if (post.stance === '약세') return -1;
  return 0;
}

export function mergePeterHistory(existing = [], posts = []) {
  const byId = new Map();
  for (const item of existing) {
    if (item?.id && item?.date && Number.isFinite(Number(item.sentiment))) {
      byId.set(item.id, { ...item, sentiment: clamp(Number(item.sentiment), -2, 2) });
    }
  }

  for (const post of posts) {
    if (!post?.id || !post?.date || !isPeter(post) || !isMarketView(post)) continue;
    byId.set(post.id, {
      id: post.id,
      date: post.date,
      title: post.title || '',
      url: post.url || '',
      person: '피터케이',
      sentiment: sentimentOf(post),
      reason: post.market_reason || post.reasoning || post.summary || '',
    });
  }

  return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
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

function pct(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0) return null;
  return Math.round(((to / from - 1) * 100) * 10) / 10;
}

function aggregate(values) {
  if (values.length === 0) return { avg: null, positiveRate: null, samples: 0 };
  const avg = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
  const positiveRate = Math.round((values.filter(value => value > 0).length / values.length) * 1000) / 10;
  return { avg, positiveRate, samples: values.length };
}

export function buildPeterBacktest(entries = [], marketHistory = {}, { windows = [5, 20], minEvents = 5 } = {}) {
  const ordered = [...entries]
    .filter(item => item?.date && Number.isFinite(Number(item.sentiment)))
    .map(item => ({ ...item, person: '피터케이', market_view: true, market_sentiment: Number(item.sentiment) }))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)));
  const historyStart = ordered[0]?.date || null;
  const historyEnd = ordered.at(-1)?.date || null;
  const tradingDates = Object.keys(marketHistory || {})
    .filter(date => ['KOSPI', 'KOSDAQ'].some(index => Number.isFinite(marketHistory[date]?.indices?.[index])))
    .sort();

  const events = [];
  let previous = null;
  for (const date of [...new Set(ordered.map(item => item.date))]) {
    const snapshot = buildPeterFearGreed(ordered, { referenceDate: date });
    const kind = snapshot.score <= 20 ? 'fear' : snapshot.score >= 80 ? 'greed' : null;
    if (!kind) { previous = null; continue; }
    const day = new Date(`${date}T00:00:00Z`).getTime();
    const sameRun = previous?.kind === kind && day - previous.day <= 7 * 86400000;
    if (sameRun) continue;
    const event = { kind, date, score: snapshot.score, outcomes: {} };
    const entryIndex = tradingDates.findIndex(tradingDate => tradingDate > date);
    for (const window of windows) {
      event.outcomes[window] = {};
      for (const index of ['KOSPI', 'KOSDAQ']) {
        const targetIndex = entryIndex >= 0 ? entryIndex + window : -1;
        const start = entryIndex >= 0 ? marketHistory[tradingDates[entryIndex]]?.indices?.[index] : null;
        const end = targetIndex >= 0 ? marketHistory[tradingDates[targetIndex]]?.indices?.[index] : null;
        event.outcomes[window][index] = pct(start, end);
      }
    }
    events.push(event);
    previous = { kind, day };
  }

  const summarize = kind => {
    const selected = events.filter(event => event.kind === kind);
    const w = {};
    for (const window of windows) {
      w[window] = {};
      for (const index of ['KOSPI', 'KOSDAQ']) {
        w[window][index] = aggregate(selected.map(event => event.outcomes[window][index]).filter(Number.isFinite));
      }
    }
    return { events: selected.length, w };
  };
  const fear = summarize('fear');
  const greed = summarize('greed');
  const judgedEvents = events.filter(event => windows.some(window => ['KOSPI', 'KOSDAQ'].some(index => Number.isFinite(event.outcomes[window][index])))).length;

  return {
    status: ordered.length === 0 ? 'insufficient' : judgedEvents >= minEvents ? 'ready' : 'limited',
    historyStart,
    historyEnd,
    marketPostCount: ordered.length,
    eventCount: events.length,
    judgedEvents,
    windows,
    method: '게시일 다음 거래일 종가부터 N거래일 후',
    fear,
    greed,
    recentEvents: events.slice(-5).reverse(),
  };
}
