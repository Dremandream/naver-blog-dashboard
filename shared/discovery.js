const CATALYST_PATTERN = /실적|수주|계약|승인|정책|규제|출시|신제품|목표가|가이던스|증설|감산|가격|배당|주주환원|인수|합병|상장|공급|투자 확대/;

function dateOffset(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeStance(stance) {
  return stance === '강세' || stance === '약세' ? stance : '중립';
}

function mergeOpinion(map, opinion) {
  if (!opinion?.person || !opinion?.stock) return;
  const normalized = { person: opinion.person, stock: opinion.stock, stance: normalizeStance(opinion.stance) };
  const key = `${normalized.person}|${normalized.stock}`;
  const current = map.get(key);
  if (!current || (current.stance === '중립' && normalized.stance !== '중립')) map.set(key, normalized);
}

export function buildMentionHistory(previous = {}, posts = [], archived = {}, referenceDate, retentionDays = 45) {
  if (!referenceDate) return {};
  const cutoff = dateOffset(referenceDate, -(retentionDays - 1));
  const records = new Map();
  const ensure = (date) => {
    if (!date || date < cutoff || date > referenceDate) return null;
    if (!records.has(date)) records.set(date, { stocks: new Set(), sectors: new Set(), opinions: new Map() });
    return records.get(date);
  };

  Object.entries(previous ?? {}).forEach(([date, record]) => {
    const target = ensure(date);
    if (!target) return;
    (record.stocks ?? []).forEach((stock) => stock && target.stocks.add(stock));
    (record.sectors ?? []).forEach((sector) => sector && sector !== '기타' && target.sectors.add(sector));
    (record.opinions ?? []).forEach((opinion) => mergeOpinion(target.opinions, opinion));
  });

  Object.entries(archived ?? {}).forEach(([date, record]) => {
    const target = ensure(date);
    if (!target) return;
    (record.opinions ?? []).forEach((opinion) => {
      if (opinion.stock) target.stocks.add(opinion.stock);
      mergeOpinion(target.opinions, opinion);
    });
  });

  posts.forEach((post) => {
    const target = ensure(post.date);
    if (!target) return;
    (post.stocks ?? []).forEach((stock) => {
      if (!stock) return;
      target.stocks.add(stock);
      mergeOpinion(target.opinions, {
        person: post.person || post.blog_name,
        stock,
        stance: post.stance,
      });
    });
    if (post.sector && post.sector !== '기타') target.sectors.add(post.sector);
  });

  return Object.fromEntries([...records.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, record]) => [date, {
    stocks: [...record.stocks].sort((a, b) => a.localeCompare(b, 'ko')),
    sectors: [...record.sectors].sort((a, b) => a.localeCompare(b, 'ko')),
    opinions: [...record.opinions.values()].sort((a, b) => (
      a.person.localeCompare(b.person, 'ko') || a.stock.localeCompare(b.stock, 'ko')
    )),
  }]));
}

export function wasMentioned(mentionHistory, stock, beforeDate, lookbackDays = 30) {
  if (!stock || !beforeDate) return false;
  const cutoff = dateOffset(beforeDate, -lookbackDays);
  return Object.entries(mentionHistory ?? {}).some(([date, record]) => (
    date >= cutoff && date < beforeDate && (record.stocks ?? []).includes(stock)
  ));
}

export function previousOpinion(mentionHistory, person, stock, beforeDate, lookbackDays = 30) {
  if (!person || !stock || !beforeDate) return null;
  const cutoff = dateOffset(beforeDate, -lookbackDays);
  const dates = Object.keys(mentionHistory ?? {}).filter((date) => date >= cutoff && date < beforeDate).sort().reverse();
  for (const date of dates) {
    const opinion = (mentionHistory[date].opinions ?? []).find((item) => item.person === person && item.stock === stock);
    if (opinion) return { ...opinion, date };
  }
  return null;
}

export function extractCatalyst(post) {
  if (typeof post?.catalyst === 'string' && post.catalyst.trim()) return post.catalyst.trim();
  const candidates = [
    ...(Array.isArray(post?.key_points) ? post.key_points : []),
    post?.reasoning,
    post?.title,
    post?.summary,
  ].filter((value) => typeof value === 'string' && value.trim());
  return candidates.find((value) => CATALYST_PATTERN.test(value))?.trim() ?? '';
}
