# plan.md — Phase 1: 주가 병기 (말 vs 가격)

## 목표
대시보드만 보고 시황·종목 판단이 가능하도록, 여론(언급/스탠스)에 **실제 주가 등락을 병기**한다.

## 검증 완료 (2026-07-12)
| 항목 | 소스 | 결과 |
|---|---|---|
| 이름→코드 | `ac.stock.naver.com/ac?q=...&target=stock` | ✅ 국내(000660)·해외(MU.O) 모두 |
| 국내 일봉 | `api.finance.naver.com/siseJson.naver?symbol=&requestType=1&...` | ✅ 종가·거래량·외국인소진율 |
| 해외 일봉 | `api.stock.naver.com/chart/foreign/item/{code}/day?startDateTime=&endDateTime=` | ✅ 28캔들 |

## 구조
1. collect-rss.js 저장 단계에서:
   - 최근 7일 글에서 **2명 이상 언급 종목** 추출 (상한 25개)
   - `config/stock-codes.json` 캐시로 이름→코드 해석 (없으면 자동완성 API, 결과 캐시에 저장)
   - 비상장(스페이스X, OpenAI 등) = 해석 실패 → 스킵
   - 국내/해외 일봉 30일 fetch → 종가 기준 **d1/d5/d20 등락률** 계산
   - posts.json 최상위에 `prices: { 종목명: { code, market, price, d1, d5, d20, asOf } }`
2. 프론트:
   - AttentionTrends: 행에 주가 컬럼 (당일 %, 5일 %) — "언급 급증 + 주가" 한눈 대조
   - StockReport: 헤더에 현재가·등락 표시

## 원칙
- 매수/매도 신호 생성 금지. 데이터 대조만.
- 시세 실패 시 여론 파이프라인은 영향 없이 동작 (prices만 비움)

## 완료 기준
1. 로컬 실행 → posts.json에 prices 채워짐 (국내+해외)
2. 대시보드에서 관심 추이에 주가 표시
3. Vercel 라이브 확인
