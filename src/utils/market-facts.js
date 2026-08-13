function finite(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sumAvailable(values) {
  const available = values.filter((value) => value != null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

function roundedDifference(left, right) {
  const a = finite(left);
  const b = finite(right);
  return a == null || b == null ? null : Math.round((a - b) * 10) / 10;
}

function normalizeDate(value) {
  const text = String(value ?? '').replace(/-/g, '');
  return /^\d{8}$/.test(text) ? text : '';
}

function ageInDays(asOf, referenceDate) {
  const start = normalizeDate(asOf);
  const end = normalizeDate(referenceDate);
  if (!start || !end) return null;
  const toUtc = (date) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)));
  return Math.floor((toUtc(end) - toUtc(start)) / 86400000);
}

function countOpinions(posts, stock) {
  const people = { bull: new Set(), bear: new Set() };
  for (const post of posts ?? []) {
    if (!post?.stocks?.includes(stock) || post.source_role !== 'opinion' || post.analysis_version !== 3) continue;
    const person = post.person || post.blog_name;
    if (!person) continue;
    if (post.stance === '강세') people.bull.add(person);
    if (post.stance === '약세') people.bear.add(person);
  }
  return { bull: people.bull.size, bear: people.bear.size };
}

function buildAlerts(opinions, price) {
  const alerts = [];
  const leaning = opinions.bull > opinions.bear ? '강세' : opinions.bear > opinions.bull ? '약세' : null;
  if (!leaning) return alerts;

  const priceAgainst = (leaning === '강세' && finite(price.d20) < 0)
    || (leaning === '약세' && finite(price.d20) > 0);
  if (priceAgainst) alerts.push(`${leaning} 의견과 20일 가격 흐름이 엇갈림`);

  const foreign5d = finite(price.investor?.foreign5d);
  const flowAgainst = foreign5d != null && ((leaning === '강세' && foreign5d < 0) || (leaning === '약세' && foreign5d > 0));
  if (flowAgainst) alerts.push(`${leaning} 의견과 외국인 5일 수급이 엇갈림`);
  return alerts;
}

function indexFacts(market, definitions) {
  return definitions.flatMap(([key, label]) => {
    const item = market[key];
    if (!item || finite(item.index) == null) return [];
    return [{
      key,
      label,
      index: finite(item.index),
      d1: finite(item.d1),
      d5: finite(item.d5),
      d20: finite(item.d20),
      foreign: finite(item.flows?.foreign),
      institution: finite(item.flows?.institution),
      foreign5d: finite(item.flows?.foreign5d),
      asOf: normalizeDate(item.asOf),
    }];
  });
}

export function buildMarketFacts(market = {}, prices = {}, posts = [], {
  referenceDate = '',
  watchlist = ['삼성전자', 'SK하이닉스'],
} = {}) {
  const indices = indexFacts(market, [['kospi', 'KOSPI'], ['kosdaq', 'KOSDAQ']]);
  const globalIndices = indexFacts(market, [['nasdaq', 'NASDAQ'], ['sp500', 'S&P 500']]);
  const fiveDayDirections = indices.map((item) => Math.sign(item.d5 ?? 0)).filter(Boolean);
  const kospi = indices.find((item) => item.key === 'kospi');

  const watchlistFacts = watchlist.flatMap((name) => {
    const price = prices[name];
    if (!price || finite(price.price) == null) return [];
    const opinions = countOpinions(posts, name);
    const priceAsOf = normalizeDate(price.asOf);
    const investorAsOf = normalizeDate(price.investor?.asOf);
    const ages = [ageInDays(priceAsOf, referenceDate), ageInDays(investorAsOf, referenceDate)].filter((age) => age != null);
    return [{
      name,
      price: finite(price.price),
      d1: finite(price.d1),
      d5: finite(price.d5),
      d20: finite(price.d20),
      relative5d: roundedDifference(price.d5, kospi?.d5),
      relative20d: roundedDifference(price.d20, kospi?.d20),
      asOf: priceAsOf,
      investor: price.investor ?? null,
      opinions,
      alerts: buildAlerts(opinions, price),
      stale: ages.some((age) => age > 4),
      asOfMismatch: Boolean(priceAsOf && investorAsOf && priceAsOf !== investorAsOf),
    }];
  });

  return {
    asOf: [...indices, ...globalIndices].map((item) => item.asOf).filter(Boolean).sort().at(-1) ?? '',
    indices,
    globalIndices,
    foreignToday: sumAvailable(indices.map((item) => item.foreign)),
    foreign5d: sumAvailable(indices.map((item) => item.foreign5d)),
    divergent: new Set(fiveDayDirections).size > 1,
    watchlist: watchlistFacts,
  };
}
