const VALID_STATUSES = new Set(['useful', 'later', 'notUseful']);

export function feedbackKey(post) {
  return post?.url || post?.id || '';
}

function snapshot(post, status, ratedAt) {
  return {
    status,
    title: post.title ?? '',
    url: post.url ?? '',
    source: post.person || post.blog_name || '출처 미상',
    sector: post.sector ?? '기타',
    stocks: [...(post.stocks ?? [])],
    postDate: post.date ?? '',
    ratedAt,
  };
}

export function updateFeedback(current, post, status, ratedAt = new Date().toISOString()) {
  const key = feedbackKey(post);
  if (!key || !VALID_STATUSES.has(status)) return { ...current };
  const next = { ...current };
  if (next[key]?.status === status) delete next[key];
  else next[key] = snapshot(post, status, ratedAt);
  return next;
}

export function feedbackCounts(feedback) {
  const counts = { useful: 0, later: 0, notUseful: 0, total: 0 };
  for (const item of Object.values(feedback ?? {})) {
    if (!VALID_STATUSES.has(item?.status)) continue;
    counts[item.status]++;
    counts.total++;
  }
  return counts;
}

export function savedForLater(posts, feedback) {
  const currentByKey = new Map((posts ?? []).map((post) => [feedbackKey(post), post]));
  return Object.entries(feedback ?? {})
    .filter(([, item]) => item?.status === 'later' && item.url)
    .map(([key, item]) => {
      const post = currentByKey.get(key);
      return {
        id: post?.id ?? key,
        title: post?.title ?? item.title,
        url: post?.url ?? item.url,
        source: post?.person || post?.blog_name || item.source,
        sector: post?.sector ?? item.sector,
        stocks: post?.stocks ?? item.stocks ?? [],
        postDate: post?.date ?? item.postDate,
        ratedAt: item.ratedAt,
      };
    })
    .sort((a, b) => String(b.ratedAt).localeCompare(String(a.ratedAt)));
}
