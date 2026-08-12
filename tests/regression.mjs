// 회귀 테스트 — 수집기 순수 함수 골든 케이스
// 실행: npm test  (외부 네트워크 불필요, <1초)
// 목적: 네이버/텔레그램 비공식 파싱과 JSON 처리 로직이 수정 중 깨지는 것을 즉시 감지.
import { parseJSONLoose, stripHtml, parseTelegramMessages, pctChange, classifyTelegramHealth, fetchClosesDated } from '../scripts/collect-rss.js';
import { judgeOne, runCritic } from '../scripts/judge.js';
import { computeSourceScores } from '../scripts/hitrate.js';
import { uniqueStrings, visibleItems } from '../src/utils/post-list.js';
import { parseJSONLoose as parseJSONLooseModule, stripHtml as stripHtmlModule } from '../scripts/lib/parsers.js';
import { buildPeterFearGreed } from '../shared/peter-fear-greed.js';
import { rankSources, selectRelatedPosts, wilsonLowerBound } from '../src/utils/source-ranking.js';
import { buildOpinionConflicts, buildWatchlistBrief, getSessionLabel, selectNewIdeas } from '../src/utils/decision-dashboard.js';
import { buildMentionHistory, extractCatalyst } from '../shared/discovery.js';
import { buildTodayDiscovery } from '../src/utils/decision-dashboard.js';
import { selectBriefSources } from '../src/utils/brief-sources.js';
import { mergeIndexSnapshot, parseAikIndexSnapshot, parseAikStockHistory } from '../scripts/lib/market-data.js';
import { analysisDepthLabel, selectMustReadPosts } from '../src/utils/must-read.js';
import { buildSemiconductorPulse } from '../src/utils/semiconductor-pulse.js';
import { buildHomeBrief } from '../src/utils/personal-home.js';
import { feedbackKey, updateFeedback, feedbackCounts, savedForLater } from '../src/utils/feedback.js';

let pass = 0, fail = 0;
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.error(`  ❌ ${name}\n     got:  ${g}\n     want: ${w}`); }
}

console.log('── parseJSONLoose ──');
eq('G1 뒤에 설명 텍스트', parseJSONLoose('{"a":1}\n\n참고용입니다.').a, 1);
eq('G2 코드펜스+앞말', parseJSONLoose('결과:\n```json\n{"sector":"반도체"}\n```').sector, '반도체');
eq('G3 문자열 내 중괄호', parseJSONLoose('{"note":"a{b}c","ok":true}').ok, true);
eq('G4 배열 값', parseJSONLoose('{"x":[1,2,3]}').x.length, 3);
try { parseJSONLoose('{"broken": "잘림'); eq('G5 잘린 JSON은 throw', 'no-throw', 'throw'); }
catch { eq('G5 잘린 JSON은 throw', 'throw', 'throw'); }

console.log('── stripHtml ──');
eq('H1 태그 제거+개행', stripHtml('a<br/>b<b>c</b>'), 'a\nbc');
eq('H2 숫자 엔티티($)', stripHtml('수출액 &#036;4,461mn'), '수출액 $4,461mn');
eq('H3 기본 엔티티', stripHtml('A &amp; B &lt;C&gt;'), 'A & B <C>');

console.log('── 글 목록 표시 규칙 ──');
eq('UI1 중복 종목 제거', uniqueStrings(['알파벳', '삼성전자', '알파벳']), ['알파벳', '삼성전자']);
eq('UI2 빈 값 제거', uniqueStrings(['', null, 'SK하이닉스', undefined]), ['SK하이닉스']);
eq('UI3 최초 24건만 표시', visibleItems(Array.from({ length: 30 }, (_, i) => i), 24).length, 24);
eq('UI4 전체보다 큰 한도는 전체 표시', visibleItems([1, 2, 3], 24), [1, 2, 3]);

console.log('── 수집기 파서 모듈 경계 ──');
eq('M1 JSON 파서 모듈 공개', parseJSONLooseModule('{"ok":true}').ok, true);
eq('M2 HTML 파서 모듈 공개', stripHtmlModule('a<br>b'), 'a\nb');

console.log('── 피터케이 Fear & Greed ──');
const peterPosts = [
  { id: 'p1', date: '2026-08-07', person: '피터케이', title: '시장 공포가 극심하다', market_view: true, market_sentiment: -2, market_reason: '투매와 공포 심리가 극심' },
  { id: 'p2', date: '2026-08-06', person: '피터케이', title: '주도주 조정 구간', market_view: true, market_sentiment: -1, market_reason: '주도주 수급 약화' },
  { id: 'x1', date: '2026-08-07', person: '다른 필자', title: '강세장', market_view: true, market_sentiment: 2 },
  { id: 'p3', date: '2026-08-07', person: '피터케이', title: '개별 기업 실적', market_view: false, market_sentiment: 2 },
];
const peterFear = buildPeterFearGreed(peterPosts, { referenceDate: '2026-08-07' });
eq('PFG1 피터케이 시장 글만 집계', [peterFear.postCount, peterFear.dayCount], [2, 2]);
eq('PFG2 최근 부정 시각은 극단적 공포', [peterFear.score, peterFear.label], [12, '극단적 공포']);
eq('PFG3 최신 근거 우선', peterFear.evidence.map(x => x.id), ['p1', 'p2']);
const peterFallback = buildPeterFearGreed([
  { id: 'old', date: '2026-08-07', person: '피터케이', title: '시장 주도주 회복', sector: '거시경제', stance: '강세' },
], { referenceDate: '2026-08-07' });
eq('PFG4 과거 스키마 제한적 폴백', [peterFallback.score, peterFallback.confidence], [75, '매우 낮음']);
const noPeter = buildPeterFearGreed([], { referenceDate: '2026-08-07' });
eq('PFG5 표본 없음', [noPeter.score, noPeter.label, noPeter.postCount], [null, '데이터 부족', 0]);

console.log('── parseTelegramMessages (t.me/s 구조 골든) ──');
const tgHtml = `
<div class="tgme_widget_message " data-post="chan/100">
  <div class="tgme_widget_message_text js-message_text">첫 번째 메시지 &#036;100</div>
  <time datetime="2026-07-10T23:30:00+00:00"></time></div>
<div class="tgme_widget_message " data-post="chan/101">
  <div class="tgme_widget_message_text js-message_text">두 번째<br/>줄바꿈</div>
  <time datetime="2026-07-12T01:00:00+00:00"></time></div>`;
const msgs = parseTelegramMessages(tgHtml, 'chan');
eq('T1 메시지 수', msgs.length, 2);
eq('T2 KST 날짜 변환(UTC 23:30→익일)', msgs[0].postDate, '2026-07-11');
eq('T3 텍스트+엔티티', msgs[0].text, '첫 번째 메시지 $100');
eq('T4 URL', msgs[1].url, 'https://t.me/chan/101');

console.log('── classifyTelegramHealth (조용한 실패 감지) ──');
eq('TG-H1 프리뷰 꺼짐(수집 불가)', classifyTelegramHealth({ previewOff: true, parsedCount: 0, windowCount: 0 }), 'preview-off');
eq('TG-H2 프리뷰 우선(파싱값 무관)', classifyTelegramHealth({ previewOff: true, parsedCount: 5, windowCount: 3 }), 'preview-off');
eq('TG-H3 파싱 0건(구조변경·차단 의심)', classifyTelegramHealth({ previewOff: false, parsedCount: 0, windowCount: 0 }), 'parse-empty');
eq('TG-H4 최근 글 없음=정상(저빈도)', classifyTelegramHealth({ previewOff: false, parsedCount: 20, windowCount: 0 }), 'no-recent');
eq('TG-H5 정상 수집', classifyTelegramHealth({ previewOff: false, parsedCount: 20, windowCount: 4 }), 'ok');

console.log('── pctChange ──');
eq('P1 1일 등락', pctChange([100, 110], 1), 10);
eq('P2 5일 등락(음수)', pctChange([200, 1, 1, 1, 1, 180], 5), -10);
eq('P3 데이터 부족 → null', pctChange([100], 1), null);
eq('P4 소수1자리 반올림', pctChange([3, 1, 1, 1], 1), 0);

console.log('── 한국주식데이터 공개 JSON ──');
const aikHistory = {
  code: '005930', as_of: '20260810', columns: ['date', 'close', 'volume'],
  rows: [['20260807', 231000, 20546010], ['20260810', 230000, 16327805]],
};
eq('AIK1 종목 이력을 기존 형식으로 변환', parseAikStockHistory(aikHistory, {
  expectedCode: '005930', minDate: '2026-08-01', now: new Date('2026-08-12T00:00:00+09:00'),
}), [{ date: '2026-08-07', close: 231000 }, { date: '2026-08-10', close: 230000 }]);
try {
  parseAikStockHistory({ ...aikHistory, code: '000660' }, {
    expectedCode: '005930', now: new Date('2026-08-12T00:00:00+09:00'),
  });
  eq('AIK2 종목코드 불일치 거부', 'no-throw', 'throw');
} catch { eq('AIK2 종목코드 불일치 거부', 'throw', 'throw'); }
try {
  parseAikStockHistory({ ...aikHistory, as_of: '20260804' }, {
    expectedCode: '005930', now: new Date('2026-08-12T00:00:00+09:00'),
  });
  eq('AIK3 8일 이상 지연 데이터 거부', 'no-throw', 'throw');
} catch { eq('AIK3 8일 이상 지연 데이터 거부', 'throw', 'throw'); }
try {
  parseAikStockHistory({ ...aikHistory, rows: [['20260810', null, 1]] }, {
    expectedCode: '005930', now: new Date('2026-08-12T00:00:00+09:00'),
  });
  eq('AIK4 잘못된 종가 거부', 'no-throw', 'throw');
} catch { eq('AIK4 잘못된 종가 거부', 'throw', 'throw'); }

const aikToday = {
  quote_as_of: '20260810',
  market_index: {
    '코스피': { name_en: 'KOSPI', close: 6299.66, change_pct: 0.65, as_of: '20260810' },
    '코스닥': { name_en: 'KOSDAQ', close: 854.47, change_pct: 6.97, as_of: '20260810' },
  },
};
const kospiSnapshot = parseAikIndexSnapshot(aikToday, 'KOSPI', new Date('2026-08-12T00:00:00+09:00'));
eq('AIK5 국내 지수 최신값 변환', kospiSnapshot, { date: '2026-08-10', close: 6299.66, d1: 0.65 });
eq('AIK6 같은 날짜 지수를 공개값으로 교체', mergeIndexSnapshot([
  { date: '2026-08-07', close: 6258.77 }, { date: '2026-08-10', close: 6200 },
], kospiSnapshot), [
  { date: '2026-08-07', close: 6258.77 }, { date: '2026-08-10', close: 6299.66 },
]);
const originalFetch = globalThis.fetch;
const fallbackUrls = [];
globalThis.fetch = async (url) => {
  fallbackUrls.push(String(url));
  if (String(url).includes('aikstockdata.com')) return new Response('not found', { status: 404 });
  return new Response('["날짜","시가","고가","저가","종가"],["20260807",1,2,3,231000],["20260810",1,2,3,230000]', { status: 200 });
};
const fallbackCloses = await fetchClosesDated({ market: 'KR', code: '005930' }, 45);
globalThis.fetch = originalFetch;
eq('AIK7 공개 JSON 실패 시 기존 네이버 시세 폴백', [
  fallbackCloses, fallbackUrls.some((url) => url.includes('api.finance.naver.com')),
], [[{ date: '2026-08-07', close: 231000 }, { date: '2026-08-10', close: 230000 }], true]);
try {
  mergeIndexSnapshot([{ date: '2026-08-11', close: 6400 }], kospiSnapshot);
  eq('AIK8 공개 지수가 기존 이력보다 오래되면 거부', 'no-throw', 'throw');
} catch { eq('AIK8 공개 지수가 기존 이력보다 오래되면 거부', 'throw', 'throw'); }
try {
  parseAikIndexSnapshot({
    ...aikToday,
    market_index: { '코스피': { name_en: 'KOSPI', close: 6299.66, change_pct: null, as_of: '20260810' } },
  }, 'KOSPI', new Date('2026-08-12T00:00:00+09:00'));
  eq('AIK9 결측 등락률을 0으로 오인하지 않음', 'no-throw', 'throw');
} catch { eq('AIK9 결측 등락률을 0으로 오인하지 않음', 'throw', 'throw'); }

console.log('── 수급 HTML 정규식 (investorDealTrendDay 골든) ──');
const flowHtml = `<td class="date2">26.07.10</td>
  <td class="rate_down3">-7,805</td><td class="rate_down3">-3,228</td><td class="rate_up3">11,314</td><td>0</td>`;
const re = /class="date2">(\d{2}\.\d{2}\.\d{2})<\/td>((?:\s*<td[^>]*>-?[\d,]+<\/td>){3,})/g;
const m = re.exec(flowHtml);
const nums = m ? [...m[2].matchAll(/<td[^>]*>(-?[\d,]+)<\/td>/g)].map(x => Number(x[1].replace(/,/g, ''))) : [];
eq('F1 날짜', m?.[1], '26.07.10');
eq('F2 개인/외인/기관', nums.slice(0, 3), [-7805, -3228, 11314]);

console.log('── judge_verdict 스펙 골든 케이스 (specs/judge_verdict.md §3) ──');
const j = (sig) => { const r = judgeOne(sig); return [r.verdict, r.confidence]; };
eq('J-G1 상한 걸림', j({ N: 5, B: 5, R: 0, P5: 3.1, FRESH_H: 2 }), ['buy', 0.50]);
eq('J-G2 감점 직후(P5=1.9 flat)', j({ N: 5, B: 5, R: 0, P5: 1.9, FRESH_H: 2 }), ['watch', 0.40]);
eq('J-G3 착시 True 강제(P5=-2.0 경계)', j({ N: 5, B: 5, R: 0, P5: -2.0, FRESH_H: 2 }), ['needs_review', 0.10]);
eq('J-G4 상한 안 걸림(D2 감점)', j({ N: 4, B: 3, R: 1, P5: 2.0, FRESH_H: 2 }), ['buy', 0.30]);
eq('J-G5 인원 부족→watch', j({ N: 2, B: 2, R: 0, P5: 8.0, FRESH_H: 2 }), ['watch', 0.20]);
eq('J-G6 bear+D1 신선도 감점', j({ N: 6, B: 0, R: 5, P5: -8.0, FRESH_H: 30 }), ['pass', 0.40]);
eq('J-G6b D1+D2 중첩(스펙모순 검출 케이스)', j({ N: 6, B: 1, R: 5, P5: -8.0, FRESH_H: 30 }), ['pass', 0.30]);

console.log('── critic 골든 케이스 (specs/critic.md §3) ──');
const ok = { ticker: 'A', verdict: 'watch', confidence: 0.30, ILLUSION: '미확인', FRESH_H: 1 };
eq('C-K1 전 건 정상', runCritic([ok]).pass, true);
eq('C-K3 stale 차단(48.1h)', runCritic([{ ...ok, FRESH_H: 48.1 }]).blocked[0].rule, 'stale');
eq('C-K4 착시 위반 차단', runCritic([{ ...ok, ILLUSION: 'True', verdict: 'buy' }]).blocked[0].rule, 'illusion-violation');
eq('C-K5 conf-cap 차단', runCritic([{ ...ok, confidence: 0.55 }]).blocked[0].rule, 'conf-cap');
eq('C-K5b conf-step 차단', runCritic([{ ...ok, confidence: 0.35 }]).blocked[0].rule, 'conf-step');
eq('C-K6 중복 티커(2번째부터 차단)', runCritic([ok, { ...ok }]).blocked.length, 1);

console.log('── 소스 적중률 골든 케이스 (hitrate.js, 지수 대비 초과수익) ──');
// 6거래일 D0..D5. D0 의견만 5일창(=D5) 판정됨. D0 전 종목·지수 100, D5에서 변동.
const D = ['2026-01-02', '2026-01-03', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'];
const p100 = {};
['S1','S2','S3','S4','S5','U1','U2','U3','U4','U5','V1','V2','V3','V4','V5','W1','W2'].forEach(s => (p100[s] = 100));
const op = (person, stock, stance, market) => ({ person, stock, stance, market });
const hist = {
  [D[0]]: {
    prices: p100,
    indices: { KOSPI: 100, NASDAQ: 100 },
    opinions: [
      ...['S1','S2','S3','S4','S5'].map(s => op('테스터', s, '강세', 'KR')),      // KR 강세, KOSPI 기준
      ...['U1','U2','U3','U4','U5'].map(s => op('미국러', s, '강세', 'US')),      // US 강세, NASDAQ 기준
      ...['V1','V2','V3','V4','V5'].map(s => op('약세러', s, '약세', 'KR')),      // KR 약세
      op('약세러', 'S1', '중립', 'KR'),                                          // 중립 → 집계 제외
      op('소수러', 'W1', '강세', 'KR'), op('소수러', 'W2', '강세', 'KR'),        // 표본 2건 → rate null
    ],
  },
  [D[1]]: { prices: {}, indices: {}, opinions: [] },
  [D[2]]: { prices: {}, indices: {}, opinions: [] },
  [D[3]]: { prices: {}, indices: {}, opinions: [] },
  [D[4]]: { prices: {}, indices: {}, opinions: [] },
  [D[5]]: {
    prices: {
      S1: 130, S2: 130, S3: 130, S4: 105, S5: 90,   // KOSPI +10% 대비: S1~3 적중, S4·S5 미적중 → 3/5
      U1: 150, U2: 150, U3: 150, U4: 115, U5: 130,   // NASDAQ +20% 대비: U1~3·U5 적중, U4 미적중 → 4/5
      V1: 90, V2: 90, V3: 90, V4: 130, V5: 130,      // 약세: V1~3 적중(하락), V4·V5 미적중(상승) → 3/5
      W1: 130, W2: 130,
    },
    indices: { KOSPI: 110, NASDAQ: 120 },            // U4(+15%)는 KOSPI(+10)면 적중, NASDAQ(+20)면 미적중 → 벤치마크 판별
    opinions: [op('펜딩', 'S1', '강세', 'KR')],       // 최신일 의견 → +5 없음 → pending
  },
};
// 골든 데이터는 6거래일뿐이라 [5,20] 창으로 검증 (프로덕션 기본창 [63,252]은 이 데이터로 성숙 불가)
// minSample=5로 명시 (프로덕션 기본 20이라, 5건 골든 케이스가 rate=null이 되지 않도록)
const scores = computeSourceScores(hist, [5, 20], 5);
const S = (name) => scores.sources.find((x) => x.person === name);
eq('HR1 KR 강세 적중률(3/5=60)', [S('테스터').w[5].hits, S('테스터').w[5].total, S('테스터').w[5].rate], [3, 5, 60]);
eq('HR2 US 나스닥 벤치마크(4/5=80)', [S('미국러').w[5].hits, S('미국러').w[5].total, S('미국러').w[5].rate], [4, 5, 80]);
eq('HR3 KR 약세 적중률(3/5=60)', [S('약세러').w[5].hits, S('약세러').w[5].total, S('약세러').w[5].rate], [3, 5, 60]);
eq('HR4 중립 제외(약세 5건만 집계, 중립은 opinions·total 모두 제외)', [S('약세러').w[5].total, S('약세러').opinions], [5, 5]);
eq('HR5 표본부족 rate=null(2건)', [S('소수러').w[5].total, S('소수러').w[5].rate], [2, null]);
eq('HR6 최신일 의견 pending(total 0)', [S('펜딩').w[5].total, S('펜딩').w[5].rate], [0, null]);
eq('HR7 20일창 아직 없음(pending)', S('테스터').w[20].total, 0);
eq('HR8 windows 메타(라벨 포함)', scores.windows, [{ n: 5, label: '5일' }, { n: 20, label: '20일' }]);
eq('HR9 기본창 프로덕션값 [63,252](3개월·1년)', computeSourceScores(hist).windows.map((w) => w.n), [63, 252]);
eq('HR10 기본창 라벨(3개월·1년)', computeSourceScores(hist).windows.map((w) => w.label), ['3개월', '1년']);
eq('HR11 기본 minSample=20(랭킹 신뢰용)', computeSourceScores(hist).minSample, 20);

console.log('── 소스 신뢰 순위·관련글 ──');
eq('SR1 윌슨 보정은 작은 표본 과대평가 방지',
  wilsonLowerBound(12, 20) < wilsonLowerBound(58, 100), true);

const rankingFixture = {
  minSample: 20,
  windows: [{ n: 63, label: '3개월' }, { n: 252, label: '1년' }],
  sources: [
    { person: '작은표본', opinions: 30, w: { 63: { hits: 12, total: 20, rate: 60 }, 252: { hits: 12, total: 20, rate: 60 } } },
    { person: '큰표본', opinions: 200, w: { 63: { hits: 61, total: 100, rate: 61 }, 252: { hits: 116, total: 200, rate: 58 } } },
    { person: '중간표본', opinions: 100, w: { 63: { hits: 32, total: 50, rate: 64 }, 252: { hits: 55, total: 100, rate: 55 } } },
  ],
};
const ranked = rankSources(rankingFixture, 'combined');
eq('SR2 종합 신뢰도는 표본 보정 후 정렬', ranked.map((s) => s.person), ['큰표본', '중간표본', '작은표본']);
eq('SR3 기간별 정렬도 표본 보정 적용', rankSources(rankingFixture, '1y')[0].person, '큰표본');

const relatedFixture = [
  { id: 'a1', person: '큰표본', blog_name: '큰표본', date: '2026-08-07', title: 'A 최신', stance: '강세', stocks: ['A'] },
  { id: 'a2', person: '큰표본', blog_name: '큰표본', date: '2026-08-06', title: 'A 중복', stance: '강세', stocks: ['A'] },
  { id: 'b1', person: '큰표본', blog_name: '큰표본', date: '2026-08-05', title: 'B 글', stance: '약세', stocks: ['B'] },
  { id: 'c1', person: '큰표본', blog_name: '큰표본', date: '2026-08-04', title: '세 번째', stance: '강세', stocks: ['C'] },
  { id: 'm1', person: '중간표본', blog_name: '중간표본', date: '2026-08-07', title: '중간 글', stance: '중립', stocks: [] },
  { id: 'old', person: '작은표본', blog_name: '작은표본', date: '2026-07-20', title: '오래된 글', stance: '강세', stocks: ['D'] },
];
const related = selectRelatedPosts(ranked, relatedFixture, { referenceDate: '2026-08-07', days: 7, topSources: 3, perSource: 2 });
eq('SR4 소스별 관련글 최대 2개', related.find((g) => g.person === '큰표본').posts.map((p) => p.id), ['a1', 'b1']);
eq('SR5 최근 7일 밖 글 제외', related.some((g) => g.person === '작은표본'), false);
eq('SR6 상위 소스 순서 유지', related.map((g) => g.person), ['큰표본', '중간표본']);

console.log('── 30초 원문 선별 대시보드 ──');
const decisionScores = {
  minSample: 2,
  windows: [{ n: 63, label: '3개월' }, { n: 252, label: '1년' }],
  sources: [
    { person: '신뢰A', opinions: 20, w: { 63: { hits: 2, total: 2, rate: 100 }, 252: { hits: 8, total: 10, rate: 80 } } },
    { person: '신뢰B', opinions: 20, w: { 63: { hits: 2, total: 2, rate: 100 }, 252: { hits: 6, total: 10, rate: 60 } } },
    { person: '신뢰C', opinions: 20, w: { 63: { hits: 2, total: 2, rate: 100 }, 252: { hits: 4, total: 10, rate: 40 } } },
  ],
};
const decisionPosts = [
  { id: 'idea-a', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '알파 신규 수주', url: 'https://example.com/a', summary: '수주가 늘었다.', stocks: ['알파'], sector: '반도체', stance: '강세', reasoning: '수주 증가로 실적 상향 가능성이 높다.' },
  { id: 'idea-gamma', date: '2026-08-08', person: '신뢰A', blog_name: '신뢰A', title: '감마 신규 공장', url: 'https://example.com/gamma', summary: '설비가 늘었다.', stocks: ['감마'], sector: '반도체', stance: '강세', reasoning: '생산능력 확대' },
  { id: 'idea-a-dup', date: '2026-08-08', person: '신뢰B', blog_name: '신뢰B', title: '알파 후속 글', url: 'https://example.com/a2', summary: '알파 재언급', stocks: ['알파'], sector: '반도체', stance: '강세', reasoning: '같은 아이디어다.' },
  { id: 'watch', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '삼성전자 전망', url: 'https://example.com/samsung', summary: '관심 종목', stocks: ['삼성전자'], sector: '반도체', stance: '강세', reasoning: 'HBM 공급 확대' },
  { id: 'watch-bear-generic', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: 'IT 가격 인상', url: 'https://example.com/generic-bear', summary: '부품 가격 상승', stocks: ['삼성전자'], sector: '반도체', stance: '약세', reasoning: '소비자 수요 위축 우려' },
  { id: 'watch-bear-direct', date: '2026-08-08', person: '신뢰C', blog_name: '신뢰C', title: '삼성전자 수요 둔화', url: 'https://example.com/direct-bear', summary: '삼성전자 출하량 감소', stocks: ['삼성전자'], sector: '반도체', stance: '약세', reasoning: '삼성전자 재고 증가' },
  { id: 'idea-b-bull', date: '2026-08-09', person: '신뢰B', blog_name: '신뢰B', title: '베타 상승 근거', url: 'https://example.com/bull', summary: '베타 강세', stocks: ['베타'], sector: '바이오', stance: '강세', reasoning: '임상 데이터가 개선됐다.' },
  { id: 'idea-b-bear', date: '2026-08-08', person: '신뢰C', blog_name: '신뢰C', title: '베타 하락 근거', url: 'https://example.com/bear', summary: '베타 약세', stocks: ['베타'], sector: '바이오', stance: '약세', reasoning: '현금 소진 속도가 빠르다.' },
  { id: 'idea-b-neutral', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '베타 동향', url: 'https://example.com/neutral', summary: '베타 관찰', stocks: ['베타'], sector: '바이오', stance: '중립', reasoning: '추가 확인 필요' },
  { id: 'idea-delta', date: '2026-08-09', person: '신뢰C', blog_name: '신뢰C', title: '델타 신제품', url: 'https://example.com/delta', summary: '델타 신제품 출시', stocks: ['델타'], sector: '자동차·로봇', stance: '강세', reasoning: '신규 시장 진입' },
  { id: 'same-bull', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '오메가 강세', url: 'https://example.com/omega-bull', summary: '오메가 긍정', stocks: ['오메가'], sector: '금융', stance: '강세', reasoning: '이익 증가' },
  { id: 'same-bear', date: '2026-08-08', person: '신뢰A', blog_name: '신뢰A', title: '오메가 약세', url: 'https://example.com/omega-bear', summary: '오메가 부정', stocks: ['오메가'], sector: '금융', stance: '약세', reasoning: '비용 증가' },
  { id: 'irrelevant', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '일상', url: 'https://example.com/x', summary: '투자 관련 내용 없음', stocks: [], sector: '기타', stance: '중립' },
];
const ideas = selectNewIdeas(decisionPosts, decisionScores, { referenceDate: '2026-08-09', watchlist: ['삼성전자'], limit: 3, days: 2 });
eq('DD1 투자 무관·관심종목 제외 및 아이디어 중복 제거', ideas.map((idea) => idea.idea), ['알파', '베타', '델타']);
eq('DD2 1년 신뢰도가 높은 소스 원문 우선', ideas[0].post.id, 'idea-a');
eq('DD2b 가능한 경우 서로 다른 소스에서 아이디어 선별', ideas.map((idea) => idea.source), ['신뢰A', '신뢰B', '신뢰C']);
const sparseTrustIdeas = selectNewIdeas([
  { id: 'trusted-1', date: '2026-08-09', person: '신뢰A', title: '알파', url: 'https://example.com/t1', summary: '알파 투자', stocks: ['알파'], sector: '반도체', stance: '강세' },
  { id: 'trusted-2', date: '2026-08-09', person: '신뢰A', title: '감마', url: 'https://example.com/t2', summary: '감마 투자', stocks: ['감마'], sector: '반도체', stance: '강세' },
  { id: 'unverified', date: '2026-08-09', person: '미검증', title: '오메가', url: 'https://example.com/u', summary: '오메가 투자', stocks: ['오메가'], sector: '금융', stance: '강세' },
], decisionScores, { referenceDate: '2026-08-09', limit: 2, days: 2 });
eq('DD2c 다양성보다 검증된 1년 신뢰도를 우선', sparseTrustIdeas.map((idea) => idea.post.id), ['trusted-1', 'trusted-2']);
const watchlistBrief = buildWatchlistBrief(decisionPosts, decisionScores, ['삼성전자'], { referenceDate: '2026-08-09', days: 7 });
eq('DD3 관심종목 최신 강세 근거 연결', watchlistBrief[0].bull.post.id, 'watch');
eq('DD3b 신뢰도보다 종목 직접 언급 근거 우선', watchlistBrief[0].bear.post.id, 'watch-bear-direct');
const conflicts = buildOpinionConflicts(decisionPosts, decisionScores, { referenceDate: '2026-08-09', days: 7, limit: 3, excludeStocks: ['삼성전자'] });
eq('DD4 강세·약세가 모두 있는 종목만 비교', conflicts.map((item) => item.stock), ['베타']);
eq('DD5 양쪽 최강 근거와 신뢰도 연결', [conflicts[0].bull.post.id, conflicts[0].bear.post.id], ['idea-b-bull', 'idea-b-bear']);
eq('DD5b 같은 필자의 시각 변화는 소스 간 충돌에서 제외', conflicts.some((item) => item.stock === '오메가'), false);
eq('DD5c 비교 소스 수는 방향성 의견만 집계', conflicts[0].sourceCount, 2);
eq('DD6 이용 시간대 라벨', [getSessionLabel(8, 30), getSessionLabel(12, 0), getSessionLabel(16, 0)], ['장 시작 전', '장중 참고', '장 마감 후']);

console.log('── 오늘 새로 볼 것 1+2+1 ──');
const mentionHistory = buildMentionHistory(
  {
    '2026-08-01': { stocks: ['알파'], sectors: ['반도체'], opinions: [{ person: '신뢰B', stock: '알파', stance: '강세' }] },
    '2026-06-01': { stocks: ['삭제대상'], sectors: ['기타'], opinions: [] },
  },
  [
    { date: '2026-08-09', person: '신뢰A', stocks: ['삼성전자'], sector: '반도체', stance: '약세' },
  ],
  {
    '2026-07-20': { opinions: [{ person: '신뢰A', stock: '삼성전자', stance: '강세' }] },
  },
  '2026-08-09',
  45,
);
eq('DISC1 이전 이력·가격 이력·최신 글을 경량 언급 이력으로 병합', mentionHistory['2026-07-20'].stocks, ['삼성전자']);
eq('DISC2 최신 글의 방향성까지 저장', mentionHistory['2026-08-09'].opinions, [{ person: '신뢰A', stock: '삼성전자', stance: '약세' }]);
eq('DISC3 보관 기간 밖 이력 제거', Object.hasOwn(mentionHistory, '2026-06-01'), false);
eq('DISC4 촉매 필드 우선', extractCatalyst({ catalyst: '신규 수주 1조원', reasoning: '일반 설명' }), '신규 수주 1조원');
eq('DISC5 기존 글은 핵심 포인트에서 촉매 폴백', extractCatalyst({ key_points: ['신규 공장 증설로 생산능력 20% 증가'] }), '신규 공장 증설로 생산능력 20% 증가');

const discoveryPosts = [
  { id: 'critical', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '삼성전자 HBM 가격 하락', url: 'https://example.com/critical', summary: '삼성전자 전망 하향', stocks: ['삼성전자'], sector: '반도체', stance: '약세', reasoning: '삼성전자 HBM 가격 하락', catalyst: 'HBM 계약가격 하락' },
  { id: 'new-1', date: '2026-08-09', person: '신뢰B', blog_name: '신뢰B', title: '뉴코 신규 수주', url: 'https://example.com/new', summary: '뉴코 첫 수주', stocks: ['뉴코'], sector: '방산', stance: '강세', reasoning: '뉴코 수주 확대', catalyst: '첫 해외 수주' },
  { id: 'resurface', date: '2026-08-09', person: '신뢰B', blog_name: '신뢰B', title: '알파 목표가 상향', url: 'https://example.com/resurface', summary: '알파 재평가', stocks: ['알파'], sector: '반도체', stance: '강세', reasoning: '알파 실적 상향', catalyst: '목표가 20% 상향' },
  { id: 'repeat-no-catalyst', date: '2026-08-09', person: '신뢰C', blog_name: '신뢰C', title: '베타 반복', url: 'https://example.com/repeat', summary: '기존 견해 반복', stocks: ['베타'], sector: '바이오', stance: '중립', reasoning: '기존 견해 유지', catalyst: '' },
];
const discoveryHistory = buildMentionHistory({
  '2026-07-20': { stocks: ['삼성전자'], sectors: ['반도체'], opinions: [{ person: '신뢰A', stock: '삼성전자', stance: '강세' }] },
  '2026-08-01': { stocks: ['알파', '베타'], sectors: ['반도체', '바이오'], opinions: [] },
}, discoveryPosts, {}, '2026-08-09', 45);
const todayDiscovery = buildTodayDiscovery(discoveryPosts, decisionScores, discoveryHistory, { items: [] }, {
  referenceDate: '2026-08-09', watchlist: ['삼성전자', 'SK하이닉스'], newLimit: 2, resurfacedLimit: 1,
});
eq('DISC6 검증 소스의 시각 전환+촉매는 관심 종목 중대 변화', [todayDiscovery.critical?.stock, todayDiscovery.critical?.conditions], ['삼성전자', ['시각 전환', '새 촉매']]);
eq('DISC7 최근 30일 미언급 종목만 완전 신규', todayDiscovery.newIdeas.map((item) => item.stock), ['뉴코']);
eq('DISC8 과거 언급+새 촉매는 재부상', todayDiscovery.resurfaced.map((item) => item.stock), ['알파']);
eq('DISC9 반복 언급이지만 촉매 없으면 재부상 제외', todayDiscovery.items.some((item) => item.post.id === 'repeat-no-catalyst'), false);
eq('DISC10 조건 미달이면 1+2+1을 억지로 채우지 않음', todayDiscovery.items.length, 3);

console.log('── 종합의견 근거 원문 선별 ──');
const briefFixture = {
  date: '2026-08-09',
  positive: [{ sector: '반도체', items: [{ name: '알파', point: '신규 수주로 실적 상향', mentions: 2 }] }],
  negative: [{ sector: '바이오', items: [{ name: '베타', point: '임상 일정 지연', mentions: 1 }] }],
  minority: ['역발상가: 시장 우려와 달리 감산 효과가 시작됐다는 시각.'],
};
const briefPosts = [
  { id: 'minority', date: '2026-08-09', person: '역발상가', blog_name: '역발상가', title: '감산 효과 시작', summary: '시장 우려와 달리 감산 효과가 나타난다.', reasoning: '공급 감소', stocks: ['감마'], stance: '강세', url: 'https://example.com/minority' },
  { id: 'alpha-weak', date: '2026-08-09', person: '미검증', blog_name: '미검증', title: '알파 신규 수주', summary: '알파 실적 상향', stocks: ['알파'], stance: '강세', url: 'https://example.com/alpha-weak' },
  { id: 'alpha-trusted', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '알파 신규 수주', summary: '알파 실적 상향', stocks: ['알파'], stance: '강세', url: 'https://example.com/alpha' },
  { id: 'beta', date: '2026-08-09', person: '신뢰B', blog_name: '신뢰B', title: '베타 임상 일정 지연', summary: '허가 일정도 늦어진다.', stocks: ['베타'], stance: '약세', url: 'https://example.com/beta' },
  { id: 'unrelated', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '무관한 글', summary: '다른 내용', stocks: ['델타'], stance: '강세', url: 'https://example.com/unrelated' },
];
const briefSources = selectBriefSources(briefFixture, briefPosts, decisionScores, { limit: 4 });
eq('BR1 소수·역발상 원문을 가장 먼저 연결', [briefSources[0].type, briefSources[0].post.id], ['minority', 'minority']);
eq('BR2 긍정·부정 핵심 원문을 균형 있게 연결', briefSources.map((item) => item.type), ['minority', 'positive', 'negative']);
eq('BR3 같은 주제면 검증된 1년 소스를 우선', briefSources.find((item) => item.type === 'positive').post.id, 'alpha-trusted');
eq('BR4 종합의견과 무관한 원문은 제외', briefSources.some((item) => item.post.id === 'unrelated'), false);
eq('BR5 같은 원문을 중복 연결하지 않음', new Set(briefSources.map((item) => item.post.url)).size, briefSources.length);
eq('BR6 리포트 기준 2일보다 오래된 원문은 제외', briefSources.every((item) => item.post.date >= '2026-08-08'), true);

console.log('── 오늘 꼭 읽을 글 ──');
const mustReadPosts = [
  { id: 'watch-deep', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '삼성전자 HBM 공급 변화', url: 'https://example.com/watch-deep', summary: '삼성전자 공급 변화', stocks: ['삼성전자'], sector: '반도체', stance: '강세', reasoning: '고객사 인증 일정이 앞당겨졌다.', catalyst: 'HBM 인증 일정 단축', why_read: '관심 종목의 공급 일정이 바뀐 글입니다.', novelty: 3, evidence_quality: 3, analysis_depth: 'full' },
  { id: 'new-evidence', date: '2026-08-09', person: '신뢰B', blog_name: '신뢰B', title: '뉴코 신규 계약', url: 'https://example.com/new-evidence', summary: '신규 계약 체결', stocks: ['뉴코'], sector: '방산', stance: '강세', reasoning: '계약 규모가 매출의 30%다.', catalyst: '첫 해외 계약', why_read: '실적을 바꿀 계약 규모가 제시됐습니다.', novelty: 3, evidence_quality: 3, analysis_depth: 'rss' },
  { id: 'contrarian', date: '2026-08-09', person: '신뢰C', blog_name: '신뢰C', title: '베타 시장의 반대 관점', url: 'https://example.com/contrarian', summary: '시장과 다른 관점', stocks: ['베타'], sector: '바이오', stance: '약세', reasoning: '현금 소진 속도가 예상보다 빠르다.', why_read: '시장 기대와 반대되는 리스크 근거가 있습니다.', novelty: 2, evidence_quality: 2, analysis_depth: 'full' },
  { id: 'same-source', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '감마 반복 의견', url: 'https://example.com/same-source', summary: '반복 의견', stocks: ['감마'], sector: '반도체', stance: '강세', reasoning: '기존 전망 유지', novelty: 1, evidence_quality: 2, analysis_depth: 'full' },
  { id: 'title-only', date: '2026-08-09', person: '미검증', blog_name: '미검증', title: '델타 전망', url: 'https://example.com/title-only', summary: '델타 전망', stocks: ['델타'], sector: '금융', stance: '중립', reasoning: '', catalyst: '', novelty: 3, evidence_quality: 3, analysis_depth: 'title' },
  { id: 'daily-life', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: '점심 기록', url: 'https://example.com/life', summary: '투자 관련 내용 없음', stocks: [], sector: '기타', stance: '해당없음', analysis_depth: 'full' },
  { id: 'no-url', date: '2026-08-09', person: '신뢰A', blog_name: '신뢰A', title: 'URL 없음', summary: '투자 글', stocks: ['오메가'], sector: '금융', stance: '강세', analysis_depth: 'full' },
];
const mustReads = selectMustReadPosts(mustReadPosts, decisionScores, {
  referenceDate: '2026-08-09', watchlist: ['삼성전자', 'SK하이닉스'], limit: 3, days: 2,
});
eq('MR1 투자 무관·URL 없는 글 제외하고 3개 선별', mustReads.map((item) => item.post.id), ['watch-deep', 'new-evidence', 'contrarian']);
eq('MR2 관심 종목의 새로운 촉매를 최우선', mustReads[0].post.id, 'watch-deep');
eq('MR3 가능한 경우 서로 다른 필자 선택', mustReads.map((item) => item.source), ['신뢰A', '신뢰B', '신뢰C']);
eq('MR4 AI 선정 이유를 그대로 사용', mustReads[1].whyRead, '실적을 바꿀 계약 규모가 제시됐습니다.');
eq('MR5 제목 기반 분석은 근거 점수를 신뢰하지 않음', selectMustReadPosts([mustReadPosts[4]], decisionScores, { referenceDate: '2026-08-09' })[0].evidenceQuality, 0);
eq('MR6 분석 깊이 라벨', ['full', 'rss', 'title'].map(analysisDepthLabel), ['본문 분석', 'RSS 요약 분석', '제목 기반 분석']);
const themePriority = selectMustReadPosts([
  { id: 'general', date: '2026-08-09', person: '신뢰A', title: '일반 금융 아이디어', url: 'https://example.com/general', summary: '새 아이디어', stocks: ['일반주'], sector: '금융', stance: '강세', novelty: 2, evidence_quality: 2, analysis_depth: 'full' },
  { id: 'semiconductor', date: '2026-08-09', person: '신뢰A', title: '반도체 업황 아이디어', url: 'https://example.com/semiconductor', summary: '반도체 사이클', stocks: ['반도체주'], sector: '반도체', stance: '강세', novelty: 2, evidence_quality: 2, analysis_depth: 'full' },
], decisionScores, { referenceDate: '2026-08-09', preferredSectors: ['반도체'], limit: 1 });
eq('MR7 반도체 선호 섹터를 동급 아이디어보다 우선', themePriority[0].post.id, 'semiconductor');
const editorialReads = selectMustReadPosts(mustReadPosts, decisionScores, {
  referenceDate: '2026-08-09', watchlist: ['삼성전자', 'SK하이닉스'], preferredSectors: ['반도체'], limit: 3, days: 2,
});
eq('MR8 목적형 편성은 반도체·시황을 첫 슬롯에 배치', [editorialReads[0].post.id, editorialReads[0].role], ['watch-deep', '반도체·시황']);
eq('MR9 목적형 편성은 비관심종목 신선 아이디어를 포함', editorialReads.some((item) => item.post.id === 'new-evidence' && item.role === '신선 아이디어'), true);

console.log('── 반도체 데일리 펄스 ──');
const semiconductorPosts = [
  { id: 'semi-bull', date: '2026-08-12', person: 'A', title: '삼성전자 HBM 공급 확대', url: 'https://example.com/semi-bull', summary: 'HBM 공급이 늘어난다.', stocks: ['삼성전자'], sector: '반도체', stance: '강세', catalyst: 'HBM 고객사 인증 통과' },
  { id: 'semi-bear', date: '2026-08-11', person: 'B', title: 'SK하이닉스 메모리 가격 우려', url: 'https://example.com/semi-bear', summary: '가격 하락 가능성', stocks: ['SK하이닉스'], sector: '반도체', stance: '약세', catalyst: '메모리 계약가격 하락' },
  { id: 'semi-market', date: '2026-08-11', person: 'C', title: 'AI 반도체 주도주 점검', url: 'https://example.com/semi-market', summary: '주도주 수급 점검', stocks: ['삼성전자', 'SK하이닉스'], sector: '거시경제', stance: '중립', market_view: true, catalyst: '' },
  { id: 'old-semi', date: '2026-08-09', person: 'D', title: '오래된 반도체 글', url: 'https://example.com/old', summary: '오래된 글', stocks: ['삼성전자'], sector: '반도체', stance: '강세', catalyst: '과거 촉매' },
  { id: 'finance', date: '2026-08-12', person: 'E', title: '은행 실적', url: 'https://example.com/finance', summary: '금융 글', stocks: ['은행주'], sector: '금융', stance: '강세' },
];
const semiconductorPulse = buildSemiconductorPulse(semiconductorPosts, { referenceDate: '2026-08-12', days: 2, catalystLimit: 3 });
eq('SP1 최근 2일 반도체 관련 글만 집계', [semiconductorPulse.postCount, semiconductorPulse.sourceCount], [3, 3]);
eq('SP2 강세·약세·중립 분포', semiconductorPulse.stances, { bull: 1, bear: 1, neutral: 1 });
eq('SP3 강약이 같으면 혼조로 과장 없이 표시', semiconductorPulse.tone, '혼조');
eq('SP4 언급 종목 빈도순', semiconductorPulse.topStocks, [{ name: '삼성전자', count: 2 }, { name: 'SK하이닉스', count: 2 }]);
eq('SP5 새 촉매와 원문을 연결', semiconductorPulse.catalysts.map((item) => [item.text, item.url]), [
  ['HBM 고객사 인증 통과', 'https://example.com/semi-bull'],
  ['메모리 계약가격 하락', 'https://example.com/semi-bear'],
]);
eq('SP6 반도체 데이터 없음은 데이터 부족', buildSemiconductorPulse([], { referenceDate: '2026-08-12' }).tone, '데이터 부족');
eq('SP7 방향성 의견이 없으면 방향성 부족', buildSemiconductorPulse([
  { id: 'neutral-semi', date: '2026-08-12', person: 'A', title: '반도체 업황 점검', sector: '반도체', stance: '중립' },
], { referenceDate: '2026-08-12' }).tone, '방향성 부족');

console.log('── 개인화 홈 브리핑 ──');
const homeBriefs = [
  {
    date: '2026-08-12', headline: '반도체 강세 우세, 데이터센터 병목은 확인 필요',
    positive: [{ sector: '반도체', items: [
      { name: '삼성전자', point: 'HBM 공급 확대', mentions: 3 },
      { name: '엔비디아', point: '신규 금융 플랫폼', mentions: 4 },
    ] }],
    negative: [{ sector: '반도체', items: [
      { name: 'SK하이닉스', point: '리레이팅 지연', mentions: 2 },
      { name: '마이크론', point: '가격 경쟁 심화', mentions: 1 },
    ] }],
    minority: ['다수 강세와 달리 데이터센터 인허가 병목을 경고'],
  },
  {
    date: '2026-08-11', headline: '메모리 강세 유지',
    positive: [{ sector: '반도체', items: [
      { name: '삼성전자', point: 'HBM 기대', mentions: 2 },
      { name: 'SK하이닉스', point: '실적 개선', mentions: 3 },
    ] }],
    negative: [],
  },
];
const homeBrief = buildHomeBrief(homeBriefs);
eq('HOME1 최신 종합판단과 핵심 강세·리스크 추출', [homeBrief.headline, homeBrief.positive.name, homeBrief.risk.name], ['반도체 강세 우세, 데이터센터 병목은 확인 필요', '엔비디아', 'SK하이닉스']);
eq('HOME2 전일 대비 방향 전환을 신규 주제보다 우선', [homeBrief.changes[0].type, homeBrief.changes[0].name], ['시각 전환', 'SK하이닉스']);
eq('HOME3 새로 부각된 주제를 언급 수 순으로 표시', homeBrief.changes.slice(1).map((item) => item.name), ['엔비디아', '마이크론']);
eq('HOME4 전일 리포트가 없으면 비교 데이터 부족', buildHomeBrief(homeBriefs.slice(0, 1)).comparisonStatus, '비교 데이터 부족');
eq('HOME5 변동 주제가 없으면 중대한 변화 없음', buildHomeBrief([homeBriefs[1], homeBriefs[1]]).comparisonStatus, '중대한 변화 없음');

console.log('── 개인 피드백 루프 ──');
const feedbackPost = { id: 'feedback-1', title: 'HBM 신규 수주', url: 'https://example.com/feedback-1', person: '신뢰A', sector: '반도체', stocks: ['삼성전자'], date: '2026-08-12' };
const usefulFeedback = updateFeedback({}, feedbackPost, 'useful', '2026-08-12T01:00:00.000Z');
eq('FB1 유용함 피드백에 원문 스냅샷 저장', usefulFeedback['https://example.com/feedback-1'], {
  status: 'useful', title: 'HBM 신규 수주', url: 'https://example.com/feedback-1', source: '신뢰A', sector: '반도체', stocks: ['삼성전자'], postDate: '2026-08-12', ratedAt: '2026-08-12T01:00:00.000Z',
});
eq('FB2 같은 피드백을 다시 누르면 취소', updateFeedback(usefulFeedback, feedbackPost, 'useful', '2026-08-12T02:00:00.000Z'), {});
const laterFeedback = updateFeedback(usefulFeedback, feedbackPost, 'later', '2026-08-12T02:00:00.000Z');
eq('FB3 다른 선택은 기존 상태를 교체', feedbackCounts(laterFeedback), { useful: 0, later: 1, notUseful: 0, total: 1 });
eq('FB4 7일 글 목록에서 사라져도 나중에 원문 유지', savedForLater([], laterFeedback), [{
  id: 'https://example.com/feedback-1', title: 'HBM 신규 수주', url: 'https://example.com/feedback-1', source: '신뢰A', sector: '반도체', stocks: ['삼성전자'], postDate: '2026-08-12', ratedAt: '2026-08-12T02:00:00.000Z',
}]);
eq('FB5 잘못된 상태는 저장하지 않음', updateFeedback({}, feedbackPost, 'buy'), {});
eq('FB6 실행마다 글 id가 바뀌어도 URL을 안정 키로 사용', feedbackKey({ ...feedbackPost, id: 'regenerated-id' }), 'https://example.com/feedback-1');

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail > 0 ? 1 : 0);
