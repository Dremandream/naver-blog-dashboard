const ACTIONS = new Set([
  '반드시 원문 읽기', '추가 조사하기', '관심 목록에 저장',
  '기존 투자 논리 점검', '참고만 하기', '제외하기',
]);
const EVIDENCE_GRADES = new Set(['A', 'B', 'C', 'D', 'F']);
const PRICE_REFLECTIONS = new Set(['미반영 가능성', '일부 반영', '상당 부분 반영', '판단 불가']);
const IMPACT_DIRECTIONS = new Set(['긍정', '부정', '혼재', '관련 없음', '판단 불가']);
const GRADE_SCORE = { A: 3, B: 3, C: 2, D: 1, F: 0 };
const WATCHLIST = ['삼성전자', 'SK하이닉스'];

const text = value => typeof value === 'string' ? value.trim() : '';

export function normalizeInvestorAnalysis(value = {}) {
  const evidenceGrade = EVIDENCE_GRADES.has(value.evidence_grade) ? value.evidence_grade : 'F';
  const impact = {};
  for (const stock of WATCHLIST) {
    const item = value.watchlist_impact?.[stock] ?? {};
    impact[stock] = {
      direction: IMPACT_DIRECTIONS.has(item.direction) ? item.direction : '판단 불가',
      reason: text(item.reason),
    };
  }

  return {
    evidence_grade: evidenceGrade,
    evidence_quality: GRADE_SCORE[evidenceGrade],
    evidence_reason: text(value.evidence_reason),
    action: ACTIONS.has(value.action) ? value.action : '추가 조사하기',
    action_reason: text(value.action_reason),
    counter_argument: text(value.counter_argument),
    price_reflection: PRICE_REFLECTIONS.has(value.price_reflection) ? value.price_reflection : '판단 불가',
    investment_chain: text(value.investment_chain),
    watchlist_impact: impact,
  };
}
