import { rankSources } from './source-ranking.js';

const TOKEN_PATTERN = /[가-힣A-Za-z0-9]+/g;
const STOPWORDS = new Set(['전망', '시장', '관련', '대한', '이번', '글', '의견', '가능성', '효과', '시각']);

function sourceName(post) {
  return post?.person || post?.blog_name || '출처 미상';
}

function postText(post) {
  return [
    post?.title,
    post?.summary,
    post?.reasoning,
    ...(post?.key_points ?? []),
    ...(post?.stocks ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function tokens(text) {
  return [...new Set((String(text).toLowerCase().match(TOKEN_PATTERN) ?? [])
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token)))];
}

function tokenOverlap(target, post) {
  const haystack = postText(post);
  return tokens(target).filter((token) => haystack.includes(token)).length;
}

function buildTrustMap(scores) {
  const windows = scores?.windows ?? [];
  const longWindow = windows[windows.length - 1];
  return new Map(rankSources(scores, '1y').map((source) => {
    const result = source.w?.[longWindow?.n];
    return [source.person, {
      adjustedScore: source.rankingScore,
      rate: result?.rate ?? null,
      total: result?.total ?? 0,
    }];
  }));
}

function enrich(post, trustMap) {
  const source = sourceName(post);
  return {
    post,
    source,
    trust: trustMap.get(source) ?? { adjustedScore: null, rate: null, total: 0 },
  };
}

function compareMatches(a, b) {
  return b.matchScore - a.matchScore
    || (b.trust.adjustedScore ?? -1) - (a.trust.adjustedScore ?? -1)
    || b.post.date.localeCompare(a.post.date);
}

function matchMinority(text, posts, trustMap) {
  const separator = text.search(/[:：]/);
  const writer = separator >= 0 ? text.slice(0, separator).trim() : '';
  const point = separator >= 0 ? text.slice(separator + 1).trim() : text.trim();
  const matches = posts
    .filter((post) => writer && sourceName(post) === writer)
    .map((post) => ({
      ...enrich(post, trustMap),
      type: 'minority',
      topic: writer,
      point,
      matchScore: 20 + tokenOverlap(point, post),
    }))
    .sort(compareMatches);
  return matches[0] ?? null;
}

function matchTopic(topic, type, posts, trustMap) {
  const expectedStance = type === 'positive' ? '강세' : '약세';
  const target = `${topic.name} ${topic.point}`;
  const normalizedName = String(topic.name ?? '').toLowerCase();
  const matches = posts.flatMap((post) => {
    const text = postText(post);
    const directName = post.stocks?.includes(topic.name) || (normalizedName.length >= 2 && text.includes(normalizedName));
    const overlap = tokenOverlap(target, post);
    if (!directName && overlap < 2) return [];
    return [{
      ...enrich(post, trustMap),
      type,
      topic: topic.name,
      point: topic.point,
      mentions: topic.mentions ?? 0,
      matchScore: (directName ? 10 : 0) + overlap * 2 + (post.stance === expectedStance ? 2 : 0),
    }];
  }).sort(compareMatches);
  return matches[0] ?? null;
}

function topicMatches(groups, type, posts, trustMap) {
  return (groups ?? []).flatMap((group) => (group.items ?? []).map((topic) => (
    matchTopic(topic, type, posts, trustMap)
  ))).filter(Boolean).sort((a, b) => (
    (b.mentions ?? 0) - (a.mentions ?? 0) || compareMatches(a, b)
  ));
}

export function selectBriefSources(brief, posts = [], scores, options = {}) {
  const { limit = 4, days = 2 } = options;
  if (!brief?.date || limit <= 0) return [];
  const cutoff = new Date(`${brief.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const candidates = posts.filter((post) => post.date >= cutoffDate && post.date <= brief.date && post.url);
  const trustMap = buildTrustMap(scores);
  const minority = (brief.minority ?? [])
    .map((text) => matchMinority(text, candidates, trustMap))
    .filter(Boolean)
    .slice(0, 2);
  const positive = topicMatches(brief.positive, 'positive', candidates, trustMap);
  const negative = topicMatches(brief.negative, 'negative', candidates, trustMap);
  const ordered = [
    ...minority,
    positive[0],
    negative[0],
    ...positive.slice(1),
    ...negative.slice(1),
  ].filter(Boolean);
  const selected = [];
  const usedUrls = new Set();
  for (const item of ordered) {
    if (selected.length >= limit) break;
    if (usedUrls.has(item.post.url)) continue;
    selected.push(item);
    usedUrls.add(item.post.url);
  }
  return selected;
}
