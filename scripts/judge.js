/**
 * judge.js — 판정 시스템 (specs/judge_verdict.md + specs/critic.md v0.1 구현)
 * 순수 함수만. 결정표 외 재량 없음. AI 호출 없음(비용 0, 결정적).
 * ⚠️ 원칙: verdict는 "결정표 조건 통과 여부"이지 매매 추천이 아님.
 */

const CONF_STEPS = [0.10, 0.20, 0.30, 0.40, 0.50];
const round2 = (x) => Math.round(x * 100) / 100;

// ─── §0.1 파생값 ─────────────────────────────────────────────────────────────
export function derive({ N, B, R, P5 }) {
  const DIR = B - R >= 2 ? 'bull' : R - B >= 2 ? 'bear' : 'mixed';
  const PDIR = P5 == null ? 'none' : P5 >= 2.0 ? 'up' : P5 <= -2.0 ? 'down' : 'flat';
  const ILLUSION =
    (DIR === 'bull' && PDIR === 'down') || (DIR === 'bear' && PDIR === 'up') ? 'True'
    : (DIR === 'bull' && PDIR === 'up') || (DIR === 'bear' && PDIR === 'down') ? 'False'
    : '미확인';
  return { DIR, PDIR, ILLUSION };
}

// ─── §1 confidence + §2 verdict ──────────────────────────────────────────────
export function judgeOne(sig) {
  const { N, B, R, FRESH_H = 0 } = sig;
  const { DIR, PDIR, ILLUSION } = derive(sig);

  // §2.1 verdict (첫 매칭 = 우선순위)
  let verdict;
  if (ILLUSION === 'True') verdict = 'needs_review';
  else if (FRESH_H > 48.0) verdict = 'needs_review';
  else if (DIR === 'bear') verdict = 'pass';
  else if (DIR === 'bull' && ILLUSION === 'False' && N >= 3) verdict = 'buy';
  else verdict = 'watch';

  // §1 confidence
  let confidence;
  if (ILLUSION === 'True') {
    confidence = 0.10; // 고정
  } else {
    let base;
    if (DIR === 'mixed') base = 0.20;
    else if (N >= 5) base = ILLUSION === 'False' ? 0.50 : 0.40;
    else if (N >= 3) base = ILLUSION === 'False' ? 0.40 : 0.30;
    else base = ILLUSION === 'False' ? 0.20 : 0.10;
    // §1.2 감점 (순서 고정: D1 → D2, 각 1회)
    if (FRESH_H > 24.0 && FRESH_H <= 48.0) base -= 0.10;                       // D1
    if ((DIR === 'bull' && R >= 1) || (DIR === 'bear' && B >= 1)) base -= 0.10; // D2
    // §1.3 하한 → 상한 (상한이 마지막)
    confidence = round2(Math.min(0.50, Math.max(0.10, base)));
  }
  return { ...sig, DIR, PDIR, ILLUSION, verdict, confidence };
}

// ─── 시그널 문서 구성: 최근 2일 글 → 종목별 {N,B,R,P5} (person 단위 중복 제거) ──
export function buildSignals(posts, prices = {}, minN = 2) {
  const dates = [...new Set(posts.map((p) => p.date))].sort().reverse().slice(0, 2);
  const recent = posts.filter((p) => dates.includes(p.date));
  const m = {};
  for (const p of recent) {
    const person = p.person || p.blog_name || 'unknown';
    const st = p.stance === '강세' ? '강세' : p.stance === '약세' ? '약세' : '중립';
    for (const s of p.stocks ?? []) {
      if (!m[s]) m[s] = {};
      const cur = m[s][person];
      if (!cur || (cur === '중립' && st !== '중립')) m[s][person] = st;
    }
  }
  return Object.entries(m)
    .map(([ticker, persons]) => {
      const vals = Object.values(persons);
      return {
        ticker,
        N: vals.length,
        B: vals.filter((x) => x === '강세').length,
        R: vals.filter((x) => x === '약세').length,
        P5: prices[ticker]?.d5 ?? null,
        FRESH_H: 0, // 파이프라인 생성 시점 = 수집 직후
      };
    })
    .filter((s) => s.N >= minN)
    .sort((a, b) => b.N - a.N);
}

// ─── critic.md — 발송 전 2차 심사 ────────────────────────────────────────────
export function runCritic(items, history = [], X = 25.0) {
  const blocked = [], flagged = [];
  // C1 신선도 (건별)
  for (const it of items) {
    if (it.FRESH_H > 48.0) blocked.push({ ticker: it.ticker, rule: 'stale', detail: `FRESH_H=${it.FRESH_H}` });
    else if (it.FRESH_H > 24.0) flagged.push({ ticker: it.ticker, rule: 'stale-warn', detail: `FRESH_H=${it.FRESH_H}` });
  }
  // C2 verdict 분포 급변 (history 5회 미만이면 생략)
  if (history.length >= 5) {
    const buyPct = Math.round((items.filter((i) => i.verdict === 'buy').length / (items.length || 1)) * 1000) / 10;
    const mean = Math.round((history.slice(0, 5).reduce((s, h) => s + h.buy_pct, 0) / 5) * 10) / 10;
    const delta = Math.round(Math.abs(buyPct - mean) * 10) / 10;
    if (delta > X) flagged.push({ ticker: '*', rule: 'dist-shift', detail: `buy_pct ${buyPct} vs 5회평균 ${mean} (Δ${delta}%p > ${X})` });
  }
  // C3 착시 위반
  for (const it of items) {
    if (it.ILLUSION === 'True' && it.verdict !== 'needs_review')
      blocked.push({ ticker: it.ticker, rule: 'illusion-violation', detail: `ILLUSION=True인데 verdict=${it.verdict}` });
  }
  // C4 confidence 위반
  for (const it of items) {
    if (it.confidence > 0.50) blocked.push({ ticker: it.ticker, rule: 'conf-cap', detail: `confidence=${it.confidence}` });
    else if (!CONF_STEPS.some((s) => Math.abs(s - it.confidence) < 1e-9))
      blocked.push({ ticker: it.ticker, rule: 'conf-step', detail: `confidence=${it.confidence} 허용집합 밖` });
  }
  // C5 동일 티커 중복 (첫 건 유지, 이후 차단)
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.ticker)) blocked.push({ ticker: it.ticker, rule: 'dup-ticker', detail: '중복 2번째 이후' });
    else seen.add(it.ticker);
  }
  return { pass: blocked.length === 0, blocked, flagged };
}

// ─── 파이프라인 진입점: 글+주가 → 판정 배치 ─────────────────────────────────
export function judgeBatch(posts, prices, history = []) {
  const items = buildSignals(posts, prices).map(judgeOne);
  const critic = runCritic(items, history);
  const blockedTickers = new Set(critic.blocked.map((b) => b.ticker));
  const published = items.filter((i) => !blockedTickers.has(i.ticker)); // blocked 건 제거(발송 차단)
  const buy_pct = Math.round((published.filter((i) => i.verdict === 'buy').length / (published.length || 1)) * 1000) / 10;
  return { items: published, critic, buy_pct };
}
