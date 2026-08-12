function finite(value) {
  if (value == null || value === '') return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function sumAvailable(values) {
  const available = values.filter((value) => value != null);
  return available.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

export function buildMarketFacts(market = {}) {
  const indices = [['kospi', 'KOSPI'], ['kosdaq', 'KOSDAQ']].flatMap(([key, label]) => {
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
      asOf: String(item.asOf ?? ''),
    }];
  });
  const fiveDayDirections = indices.map((item) => Math.sign(item.d5 ?? 0)).filter(Boolean);
  return {
    asOf: indices.map((item) => item.asOf).filter(Boolean).sort().at(-1) ?? '',
    indices,
    foreignToday: sumAvailable(indices.map((item) => item.foreign)),
    foreign5d: sumAvailable(indices.map((item) => item.foreign5d)),
    divergent: new Set(fiveDayDirections).size > 1,
  };
}
