// 회귀 테스트 — 수집기 순수 함수 골든 케이스
// 실행: npm test  (외부 네트워크 불필요, <1초)
// 목적: 네이버/텔레그램 비공식 파싱과 JSON 처리 로직이 수정 중 깨지는 것을 즉시 감지.
import { parseJSONLoose, stripHtml, parseTelegramMessages, pctChange } from '../scripts/collect-rss.js';
import { judgeOne, runCritic } from '../scripts/judge.js';

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

console.log('── pctChange ──');
eq('P1 1일 등락', pctChange([100, 110], 1), 10);
eq('P2 5일 등락(음수)', pctChange([200, 1, 1, 1, 1, 180], 5), -10);
eq('P3 데이터 부족 → null', pctChange([100], 1), null);
eq('P4 소수1자리 반올림', pctChange([3, 1, 1, 1], 1), 0);

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

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
process.exit(fail > 0 ? 1 : 0);
