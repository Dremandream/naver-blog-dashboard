function flattenOpinions(brief) {
  const rows = [];
  for (const [field, stance] of [['positive', '강세'], ['negative', '약세']]) {
    for (const group of brief?.[field] ?? []) {
      for (const item of group.items ?? []) {
        rows.push({
          name: item.name,
          point: item.point,
          mentions: Number(item.mentions) || 0,
          sector: group.sector,
          stance,
        });
      }
    }
  }
  return rows;
}

function strongest(items) {
  return [...items].sort((a, b) => b.mentions - a.mentions)[0] ?? null;
}

export function buildHomeBrief(briefs) {
  const list = (Array.isArray(briefs) ? briefs : briefs ? [briefs] : [])
    .filter((brief) => brief?.headline || brief?.brief);
  const latest = list[0];
  if (!latest) {
    return {
      headline: '오늘 종합 리포트가 아직 없습니다.', positive: null, risk: null,
      minority: '', choi: null, changes: [], comparisonStatus: '비교 데이터 부족', date: '',
    };
  }

  const current = flattenOpinions(latest);
  const previous = list[1] ? flattenOpinions(list[1]) : [];
  const previousByName = new Map(previous.map((item) => [item.name, item]));
  const switched = current
    .filter((item) => previousByName.has(item.name) && previousByName.get(item.name).stance !== item.stance)
    .map((item) => ({ ...item, type: '시각 전환', previousStance: previousByName.get(item.name).stance }));
  const newTopics = current
    .filter((item) => !previousByName.has(item.name))
    .map((item) => ({ ...item, type: '새로 부각' }));
  const changes = [...switched, ...newTopics]
    .sort((a, b) => (a.type === b.type ? b.mentions - a.mentions : a.type === '시각 전환' ? -1 : 1))
    .slice(0, 3);

  return {
    headline: latest.headline || latest.brief,
    positive: strongest(current.filter((item) => item.stance === '강세')),
    risk: strongest(current.filter((item) => item.stance === '약세')),
    minority: latest.minority?.[0] ?? '',
    choi: latest.research_team?.choi ?? latest.choi ?? null,
    changes,
    comparisonStatus: list[1] ? (changes.length ? '변화 감지' : '중대한 변화 없음') : '비교 데이터 부족',
    date: latest.date ?? '',
  };
}
