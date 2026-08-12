import { rankSources } from './source-ranking.js';

const DIRECTIONAL = new Set(['강세', '약세']);
const DEPTH_SCORE = { full: 8, rss: 4, unknown: 0, title: -12 };
const ACTIONS = new Set(['반드시 원문 읽기', '추가 조사하기', '관심 목록에 저장', '기존 투자 논리 점검', '참고만 하기', '제외하기']);
const ACTION_SCORE = { '반드시 원문 읽기': 12, '기존 투자 논리 점검': 9, '추가 조사하기': 6, '관심 목록에 저장': 4, '참고만 하기': 0, '제외하기': -100 };
const SOURCE_SCORE = { blog: 8, telegram: 0 };

function clampScore(value, max = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(max, Math.round(number)));
}

function cutoffDate(referenceDate, days) {
  const cutoff = new Date(`${referenceDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  return cutoff.toISOString().slice(0, 10);
}

function isInvestmentPost(post) {
  const text = `${post?.title ?? ''} ${post?.summary ?? ''}`;
  if (text.includes('투자 관련 내용 없음')) return false;
  return (post?.stocks?.length ?? 0) > 0
    || (post?.sector && post.sector !== '기타')
    || DIRECTIONAL.has(post?.stance);
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

export function analysisDepthLabel(depth) {
  if (depth === 'full') return '본문 분석';
  if (depth === 'rss') return 'RSS 요약 분석';
  if (depth === 'title') return '제목 기반 분석';
  return '분석 범위 미기록';
}

function fallbackWhyRead(post, depth) {
  if (depth === 'title') return '본문이 부족해 제목 기준으로 분류했습니다. 원문 확인이 필요합니다.';
  if (post.catalyst) return `새 촉매: ${post.catalyst}`;
  return post.reasoning || post.summary || post.title || '원문에서 투자 근거를 확인할 필요가 있습니다.';
}

export function resolveReadAction(post, trust, depth, evidenceQuality) {
  let action = ACTIONS.has(post?.action) ? post.action : '추가 조사하기';
  if (action === '제외하기') return action;
  if (action === '반드시 원문 읽기' && (
    depth === 'title' || evidenceQuality === 0 || (trust?.rate != null && trust.rate < 40)
  )) return '추가 조사하기';
  return action;
}

function enrichPost(post, trustMap, watchlist, preferredSectors) {
  const depth = ['full', 'rss', 'title'].includes(post.analysis_depth) ? post.analysis_depth : 'unknown';
  const evidenceQuality = depth === 'title' ? 0 : clampScore(post.evidence_quality);
  const novelty = depth === 'title' ? Math.min(clampScore(post.novelty), 1) : clampScore(post.novelty);
  const source = sourceName(post);
  const trust = trustMap.get(source) ?? { adjustedScore: null, rate: null, total: 0, window: '1년' };
  const watchlistHit = (post.stocks ?? []).some((stock) => watchlist.has(stock));
  const preferredSectorHit = preferredSectors.has(post.sector);
  const marketView = post.market_view === true;
  const action = resolveReadAction(post, trust, depth, evidenceQuality);
  const trustPenalty = trust.rate != null && trust.rate < 40 && trust.total >= 20 ? 20 : 0;
  const score = (watchlistHit ? 30 : 0)
    + (preferredSectorHit ? 14 : 0)
    + (marketView ? 12 : 0)
    + (post.catalyst ? 18 : 0)
    + novelty * 10
    + evidenceQuality * 9
    + (trust.adjustedScore == null ? 0 : Math.max(0, Math.min(100, trust.adjustedScore)) * 0.25)
    + (DEPTH_SCORE[depth] ?? DEPTH_SCORE.unknown)
    + (ACTION_SCORE[action] ?? 0)
    + (SOURCE_SCORE[post.source] ?? 0)
    - trustPenalty;

  return {
    post,
    source,
    trust,
    score: Math.round(score * 10) / 10,
    whyRead: String(post.why_read || fallbackWhyRead(post, depth)).trim(),
    novelty,
    evidenceQuality,
    depth,
    depthLabel: analysisDepthLabel(depth),
    watchlistHit,
    preferredSectorHit,
    marketView,
    action,
  };
}

export function selectMustReadPosts(posts, scores, options = {}) {
  const {
    referenceDate = posts.reduce((latest, post) => post.date > latest ? post.date : latest, ''),
    watchlist = [],
    preferredSectors = [],
    limit = 3,
    days = 2,
  } = options;
  if (!referenceDate || limit <= 0) return [];

  const cutoff = cutoffDate(referenceDate, days);
  const trustMap = buildTrustMap(scores);
  const watchlistSet = new Set(watchlist);
  const preferredSectorSet = new Set(preferredSectors);
  const seenUrls = new Set();
  const candidates = posts
    .filter((post) => post?.url && post.date >= cutoff && post.date <= referenceDate && isInvestmentPost(post))
    .filter((post) => post.action !== '제외하기')
    .filter((post) => {
      if (seenUrls.has(post.url)) return false;
      seenUrls.add(post.url);
      return true;
    })
    .map((post) => enrichPost(post, trustMap, watchlistSet, preferredSectorSet))
    .sort((a, b) => b.score - a.score
      || b.post.date.localeCompare(a.post.date)
      || a.source.localeCompare(b.source, 'ko'));

  const selected = [];
  const selectedIds = new Set();
  const selectedSources = new Set();
  const append = (item, requireNewSource, role = '추가 핵심') => {
    if (selected.length >= limit || selectedIds.has(item.post.id)) return;
    if (requireNewSource && selectedSources.has(item.source)) return;
    selected.push({ ...item, role });
    selectedIds.add(item.post.id);
    selectedSources.add(item.source);
  };

  if (preferredSectorSet.size > 0) {
    // A preferred-sector post is the strongest fit for this slot. Fall back to
    // a broader market-view post only when the recent set has no sector match.
    const focus = candidates.find((item) => item.preferredSectorHit)
      ?? candidates.find((item) => item.marketView);
    if (focus) append(focus, false, '반도체·시황');

    const fresh = candidates.filter((item) => (
      !selectedIds.has(item.post.id)
      && !item.watchlistHit
      && (item.novelty >= 2 || Boolean(item.post.catalyst))
    ));
    const diverseFresh = fresh.find((item) => !selectedSources.has(item.source)) ?? fresh[0];
    if (diverseFresh) append(diverseFresh, false, '신선 아이디어');
  }

  candidates.forEach((item) => append(item, true));
  if (selected.length < limit) candidates.forEach((item) => append(item, false));
  return selected;
}
