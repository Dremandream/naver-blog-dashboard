const SEMICONDUCTOR_TERMS = /반도체|HBM|DRAM|NAND|메모리|파운드리|AI\s*칩|삼성전자|SK하이닉스|엔비디아|마이크론/i;

function cutoffDate(referenceDate, days) {
  const cutoff = new Date(`${referenceDate}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - (days - 1));
  return cutoff.toISOString().slice(0, 10);
}

function isSemiconductorPost(post) {
  if (post?.sector === '반도체') return true;
  const text = [post?.title, post?.summary, post?.reasoning, ...(post?.stocks ?? [])].filter(Boolean).join(' ');
  return SEMICONDUCTOR_TERMS.test(text);
}

function sourceName(post) {
  return post?.person || post?.blog_name || '출처 미상';
}

function toneFrom(stances) {
  if (stances.bull === 0 && stances.bear === 0) return '방향성 부족';
  if (stances.bull === stances.bear) return '혼조';
  return stances.bull > stances.bear ? '강세 우세' : '약세 우세';
}

export function buildSemiconductorPulse(posts, options = {}) {
  const {
    referenceDate = posts.reduce((latest, post) => post.date > latest ? post.date : latest, ''),
    days = 2,
    stockLimit = 5,
    catalystLimit = 3,
  } = options;
  if (!referenceDate) {
    return { postCount: 0, sourceCount: 0, marketViewCount: 0, stances: { bull: 0, bear: 0, neutral: 0 }, tone: '데이터 부족', topStocks: [], catalysts: [] };
  }

  const cutoff = cutoffDate(referenceDate, days);
  const related = posts.filter((post) => (
    post?.date >= cutoff && post.date <= referenceDate && isSemiconductorPost(post)
  ));
  if (related.length === 0) {
    return { postCount: 0, sourceCount: 0, marketViewCount: 0, stances: { bull: 0, bear: 0, neutral: 0 }, tone: '데이터 부족', topStocks: [], catalysts: [] };
  }

  const stances = { bull: 0, bear: 0, neutral: 0 };
  const sources = new Set();
  const stockCounts = new Map();
  let stockOrder = 0;
  let marketViewCount = 0;
  for (const post of related) {
    sources.add(sourceName(post));
    if (post.stance === '강세') stances.bull++;
    else if (post.stance === '약세') stances.bear++;
    else stances.neutral++;
    if (post.market_view === true) marketViewCount++;
    for (const stock of post.stocks ?? []) {
      const current = stockCounts.get(stock) ?? { name: stock, count: 0, order: stockOrder++ };
      current.count++;
      stockCounts.set(stock, current);
    }
  }

  const topStocks = [...stockCounts.values()]
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .slice(0, stockLimit)
    .map(({ name, count }) => ({ name, count }));

  const seenCatalysts = new Set();
  const catalysts = related
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .flatMap((post) => {
      const text = String(post.catalyst ?? '').trim();
      if (!text || seenCatalysts.has(text)) return [];
      seenCatalysts.add(text);
      return [{ text, url: post.url, source: sourceName(post), date: post.date, stock: post.stocks?.[0] ?? '' }];
    })
    .slice(0, catalystLimit);

  return {
    postCount: related.length,
    sourceCount: sources.size,
    marketViewCount,
    stances,
    tone: toneFrom(stances),
    topStocks,
    catalysts,
  };
}
