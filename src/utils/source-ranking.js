export function wilsonLowerBound(hits, total, z = 1.96) {
  if (!Number.isFinite(hits) || !Number.isFinite(total) || total <= 0) return null;
  const p = hits / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return ((centre - margin) / denominator) * 100;
}

function windowScore(source, window, minSample) {
  const result = source.w?.[window?.n];
  if (!result || result.total < minSample || result.rate == null) return null;
  return wilsonLowerBound(result.hits, result.total);
}

export function rankSources(scores, mode = 'combined') {
  const windows = scores?.windows ?? [];
  const sources = scores?.sources ?? [];
  const minSample = scores?.minSample ?? 20;
  const shortWindow = windows[0];
  const longWindow = windows[windows.length - 1];

  return sources
    .map((source) => {
      const shortScore = windowScore(source, shortWindow, minSample);
      const longScore = windowScore(source, longWindow, minSample);
      let rankingScore = null;

      if (mode === '3m') rankingScore = shortScore;
      else if (mode === '1y') rankingScore = longScore;
      else if (shortScore != null && longScore != null) rankingScore = shortScore * 0.4 + longScore * 0.6;
      else rankingScore = longScore ?? shortScore;

      return {
        ...source,
        rankingScore: rankingScore == null ? null : Math.round(rankingScore * 10) / 10,
        shortWindow,
        longWindow,
        hasBothWindows: shortScore != null && longScore != null,
      };
    })
    .sort((a, b) => {
      if (a.rankingScore == null) return 1;
      if (b.rankingScore == null) return -1;
      if (mode === 'combined' && a.hasBothWindows !== b.hasBothWindows) return a.hasBothWindows ? -1 : 1;
      return b.rankingScore - a.rankingScore || (b.opinions ?? 0) - (a.opinions ?? 0);
    });
}

function postPriority(post) {
  const directional = post.stance === '강세' || post.stance === '약세';
  return (directional ? 2 : 0) + ((post.stocks?.length ?? 0) > 0 ? 1 : 0);
}

export function selectRelatedPosts(rankedSources, posts, options = {}) {
  const {
    referenceDate = posts.reduce((latest, post) => post.date > latest ? post.date : latest, ''),
    days = 7,
    topSources = 5,
    perSource = 2,
  } = options;
  if (!referenceDate) return [];

  const cutoff = new Date(`${referenceDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return rankedSources.slice(0, topSources).flatMap((source) => {
    const seenStocks = new Set();
    const selected = posts
      .filter((post) => (post.person || post.blog_name) === source.person && post.date >= cutoffDate && post.date <= referenceDate)
      .sort((a, b) => postPriority(b) - postPriority(a) || b.date.localeCompare(a.date))
      .filter((post) => {
        const primaryStock = post.stocks?.[0];
        if (!primaryStock) return true;
        if (seenStocks.has(primaryStock)) return false;
        seenStocks.add(primaryStock);
        return true;
      })
      .slice(0, perSource);

    return selected.length > 0 ? [{ ...source, posts: selected }] : [];
  });
}
