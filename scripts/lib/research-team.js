export const RESEARCH_TEAM_VERSION = 1;

const text = (value) => typeof value === 'string' ? value.trim() : '';
const strings = (value, limit = 6) => (Array.isArray(value) ? value : [])
  .map(text)
  .filter(Boolean)
  .slice(0, limit);

const EVIDENCE_RANK = { A: 5, B: 4, C: 3, D: 2, F: 1 };

export function buildKimReport(posts = []) {
  const validPosts = posts.filter((post) => post && (post.summary || post.title));
  const people = new Set(validPosts.map((post) => post.person || post.blog_name).filter(Boolean));
  const opinionCount = validPosts.filter((post) => post.source_role === 'opinion').length;
  const factCount = validPosts.filter((post) => post.source_role === 'fact').length;
  const mixedCount = validPosts.length - opinionCount - factCount;

  const keyEvidence = validPosts
    .map((post) => ({
      topic: text(post.headline) || text(post.title),
      fact: text(post.reasoning) || text(post.summary),
      numbers: strings(post.numbers, 3),
      source: text(post.person) || text(post.blog_name),
      source_role: ['opinion', 'fact', 'mixed'].includes(post.source_role) ? post.source_role : 'mixed',
      evidence_grade: EVIDENCE_RANK[post.evidence_grade] ? post.evidence_grade : 'D',
      url: text(post.url),
      _novelty: Number(post.novelty) || 0,
    }))
    .filter((item) => item.topic && item.fact)
    .sort((a, b) => (EVIDENCE_RANK[b.evidence_grade] - EVIDENCE_RANK[a.evidence_grade]) || (b._novelty - a._novelty))
    .slice(0, 8)
    .map(({ _novelty, ...item }) => item);

  const missingReasoning = validPosts.filter((post) => !text(post.reasoning)).length;
  const titleOnly = validPosts.filter((post) => post.analysis_depth === 'title').length;
  const dataGaps = [];
  if (missingReasoning) dataGaps.push(`핵심 근거 없음 ${missingReasoning}건`);
  if (titleOnly) dataGaps.push(`제목 기반 분석 ${titleOnly}건`);
  if (!keyEvidence.length) dataGaps.push('인용 가능한 핵심 근거 없음');

  return {
    post_count: validPosts.length,
    source_count: people.size,
    opinion_count: opinionCount,
    fact_count: factCount,
    mixed_count: mixedCount,
    key_evidence: keyEvidence,
    data_gaps: dataGaps,
  };
}

export function normalizeLeeReport(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return {
    consensus: strings(value.consensus, 5),
    conflicts: strings(value.conflicts, 5),
    minority: strings(value.minority, 4),
    questions: strings(value.questions, 5),
  };
}

export function normalizeParkReport(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  return {
    verified: strings(value.verified, 5),
    contradictions: strings(value.contradictions, 5),
    risks: strings(value.risks, 5),
    data_gaps: strings(value.data_gaps, 5),
  };
}

function normalizeGroups(value) {
  return (Array.isArray(value) ? value : [])
    .map((group) => ({
      sector: text(group?.sector) || '기타',
      items: (Array.isArray(group?.items) ? group.items : [])
        .map((item) => ({
          name: text(item?.name),
          point: text(item?.point),
          mentions: Number(item?.mentions) || 0,
        }))
        .filter((item) => item.name),
    }))
    .filter((group) => group.items.length > 0);
}

export function normalizeChoiBrief(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const rawDecision = text(value?.choi?.decision);
  const decisionAliases = { '강세 우세': '긍정 우세', '약세 우세': '부정 우세' };
  const decision = decisionAliases[rawDecision] || rawDecision;
  const allowedDecisions = ['긍정 우세', '부정 우세', '혼조', '판단 유보'];
  const confidence = text(value?.choi?.confidence);

  return {
    headline: text(value.headline),
    positive: normalizeGroups(value.positive),
    negative: normalizeGroups(value.negative),
    minority: strings(value.minority, 2),
    events: (Array.isArray(value.events) ? value.events : [])
      .map((event) => ({
        date: text(event?.date),
        label: text(event?.label),
        stocks: strings(event?.stocks, 5),
        source: text(event?.source),
        approx: event?.approx === true,
      }))
      .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.label)
      .slice(0, 6),
    choi: {
      decision: allowedDecisions.includes(decision) ? decision : '판단 유보',
      confidence: ['높음', '보통', '낮음'].includes(confidence) ? confidence : '낮음',
      summary: text(value?.choi?.summary),
      reasons: strings(value?.choi?.reasons, 3),
      counter_case: text(value?.choi?.counter_case),
      watch_items: strings(value?.choi?.watch_items, 5),
      invalidation_conditions: strings(value?.choi?.invalidation_conditions, 4),
    },
  };
}
