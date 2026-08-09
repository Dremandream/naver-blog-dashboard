import { rankSources } from './source-ranking.js';

const DIRECTIONAL = new Set(['강세', '약세']);

function cutoffDate(referenceDate, days) {
  const cutoff = new Date(`${referenceDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  return cutoff.toISOString().slice(0, 10);
}

function inDateRange(post, referenceDate, days) {
  if (!post?.date || !referenceDate) return false;
  return post.date >= cutoffDate(referenceDate, days) && post.date <= referenceDate;
}

function isInvestmentPost(post) {
  const text = `${post?.title ?? ''} ${post?.summary ?? ''}`;
  if (text.includes('투자 관련 내용 없음')) return false;
  return (post?.stocks?.length ?? 0) > 0 || (post?.sector && post.sector !== '기타') || DIRECTIONAL.has(post?.stance);
}

function sourceName(post) {
  return post?.person || post?.blog_name || '출처 미상';
}

function buildTrustMap(scores) {
  const longWindow = (scores?.windows ?? []).reduce((longest, window) => (
    !longest || window.n > longest.n ? window : longest
  ), null);
  return new Map(rankSources(scores, '1y').map((source) => {
    const result = source.w?.[longWindow?.n];
    return [source.person, {
      adjustedScore: source.rankingScore,
      rate: result?.rate ?? null,
      total: result?.total ?? 0,
      window: longWindow?.label ?? '1년',
    }];
  }));
}

function enrichPost(post, trustMap) {
  return {
    post,
    source: sourceName(post),
    trust: trustMap.get(sourceName(post)) ?? {
      adjustedScore: null,
      rate: null,
      total: 0,
      window: '1년',
    },
  };
}

function mentionsStock(post, stock) {
  if (!stock) return false;
  const text = `${post?.title ?? ''} ${post?.reasoning ?? ''} ${post?.summary ?? ''}`.toLowerCase();
  return text.includes(stock.toLowerCase());
}

function compareEvidence(a, b, stock = '') {
  if (stock) {
    const directDifference = Number(mentionsStock(b.post, stock)) - Number(mentionsStock(a.post, stock));
    if (directDifference) return directDifference;
  }
  const aScore = a.trust.adjustedScore ?? -1;
  const bScore = b.trust.adjustedScore ?? -1;
  return bScore - aScore
    || b.post.date.localeCompare(a.post.date)
    || (b.post.reasoning?.length ?? 0) - (a.post.reasoning?.length ?? 0);
}

function ideaFromPost(post, watchlist) {
  const stocks = post.stocks ?? [];
  if (stocks.length > 0) return stocks.find((stock) => !watchlist.has(stock)) ?? null;
  return post.sector && post.sector !== '기타' ? post.sector : null;
}

export function selectNewIdeas(posts, scores, options = {}) {
  const {
    referenceDate = posts.reduce((latest, post) => post.date > latest ? post.date : latest, ''),
    watchlist = [],
    limit = 3,
    days = 2,
  } = options;
  if (!referenceDate) return [];

  const watchlistSet = new Set(watchlist);
  const trustMap = buildTrustMap(scores);
  const candidates = posts
    .filter((post) => inDateRange(post, referenceDate, days) && isInvestmentPost(post) && post.url)
    .map((post) => ({ ...enrichPost(post, trustMap), idea: ideaFromPost(post, watchlistSet) }))
    .filter((item) => item.idea)
    .sort(compareEvidence);

  const selected = [];
  const seenIdeas = new Set();
  const seenSources = new Set();
  const append = (item, requireNewSource) => {
    if (selected.length >= limit || seenIdeas.has(item.idea)) return;
    if (requireNewSource && seenSources.has(item.source)) return;
    selected.push(item);
    seenIdeas.add(item.idea);
    seenSources.add(item.source);
  };

  const validated = candidates.filter((item) => item.trust.adjustedScore != null);
  validated.forEach((item) => append(item, true));
  if (selected.length < limit) validated.forEach((item) => append(item, false));
  if (selected.length < limit) candidates.forEach((item) => append(item, true));
  if (selected.length < limit) candidates.forEach((item) => append(item, false));
  return selected;
}

function strongestEvidence(posts, stance, trustMap, stock = '') {
  return posts
    .filter((post) => post.stance === stance)
    .map((post) => ({ ...enrichPost(post, trustMap), direct: stock ? mentionsStock(post, stock) : null }))
    .sort((a, b) => compareEvidence(a, b, stock))[0] ?? null;
}

export function buildWatchlistBrief(posts, scores, watchlist, options = {}) {
  const {
    referenceDate = posts.reduce((latest, post) => post.date > latest ? post.date : latest, ''),
    days = 7,
  } = options;
  const trustMap = buildTrustMap(scores);

  return watchlist.map((stock) => {
    const related = posts.filter((post) => (
      inDateRange(post, referenceDate, days)
      && isInvestmentPost(post)
      && post.stocks?.includes(stock)
    ));
    return {
      stock,
      count: related.length,
      bull: strongestEvidence(related, '강세', trustMap, stock),
      bear: strongestEvidence(related, '약세', trustMap, stock),
      latest: related.slice().sort((a, b) => b.date.localeCompare(a.date))[0] ?? null,
    };
  });
}

export function buildOpinionConflicts(posts, scores, options = {}) {
  const {
    referenceDate = posts.reduce((latest, post) => post.date > latest ? post.date : latest, ''),
    days = 7,
    limit = 3,
    excludeStocks = [],
  } = options;
  const excluded = new Set(excludeStocks);
  const trustMap = buildTrustMap(scores);
  const byStock = new Map();

  posts.filter((post) => inDateRange(post, referenceDate, days) && isInvestmentPost(post)).forEach((post) => {
    (post.stocks ?? []).forEach((stock) => {
      if (excluded.has(stock)) return;
      if (!byStock.has(stock)) byStock.set(stock, []);
      byStock.get(stock).push(post);
    });
  });

  return [...byStock.entries()].flatMap(([stock, related]) => {
    const directional = related.filter((post) => DIRECTIONAL.has(post.stance));
    const bulls = directional
      .filter((post) => post.stance === '강세')
      .map((post) => ({ ...enrichPost(post, trustMap), direct: mentionsStock(post, stock) }));
    const bears = directional
      .filter((post) => post.stance === '약세')
      .map((post) => ({ ...enrichPost(post, trustMap), direct: mentionsStock(post, stock) }));
    const pairs = bulls.flatMap((bull) => bears
      .filter((bear) => bear.source !== bull.source)
      .map((bear) => ({ bull, bear })));
    pairs.sort((a, b) => {
      const aDirect = Number(a.bull.direct) + Number(a.bear.direct);
      const bDirect = Number(b.bull.direct) + Number(b.bear.direct);
      const aTrust = (a.bull.trust.adjustedScore ?? -1) + (a.bear.trust.adjustedScore ?? -1);
      const bTrust = (b.bull.trust.adjustedScore ?? -1) + (b.bear.trust.adjustedScore ?? -1);
      return bDirect - aDirect || bTrust - aTrust;
    });
    const pair = pairs[0];
    if (!pair) return [];
    const sources = new Set(directional.map(sourceName));
    return [{ stock, ...pair, sourceCount: sources.size, postCount: directional.length }];
  }).sort((a, b) => b.sourceCount - a.sourceCount || b.postCount - a.postCount || a.stock.localeCompare(b.stock, 'ko'))
    .slice(0, limit);
}

export function getSessionLabel(hour, minute = 0) {
  const minutes = hour * 60 + minute;
  if (minutes < 9 * 60) return '장 시작 전';
  if (minutes >= 15 * 60 + 30) return '장 마감 후';
  return '장중 참고';
}
