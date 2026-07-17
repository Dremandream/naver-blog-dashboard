# plan.md — 소스 적중률 (로드맵 §8-4, 대형)

## 목표
소스(필자)가 강세/약세 의견을 낸 종목의 실제 성과를 추적 → 소스별 신뢰 점수.
"이 필자 말을 얼마나 믿을 수 있나"를 데이터로.

## 확정 스펙 (2026-07-17 사용자 결정)
- **적중 기준**: 지수 대비 초과수익 (benchmark-relative). 시장 전체가 오른 날의 운을 걸러 실력만 측정.
  - 강세 의견 → (종목 수익률 − 지수 수익률) > 0 이면 적중
  - 약세 의견 → (종목 수익률 − 지수 수익률) < 0 이면 적중
  - 중립 의견은 적중률 집계 제외
- **평가 기간**: 5일·20일 둘 다 (거래일 기준)
- **벤치마크**: KR 종목 → KOSPI(코스닥주면 KOSDAQ). ⚠️ **US 종목은 현재 추적 지수 없음** → phase 2에서 ^GSPC/^IXIC 지수 수집 추가 필요. 그전까지 US 종목은 절대수익 폴백 또는 집계 제외(구현 시 결정).

## Phase 1 — 데이터 축적 + 소급 백필 (이번 세션 완료 ✅)
- `fetchClosesDated()`/`fetchIndexClosesDated()` — 네이버 시세 API가 원래 45일치 일봉을
  받아오는데 날짜를 버리고 등락률만 쓰던 걸, 날짜 보존 버전으로 추출. fetchPrices/fetchMarketData가
  `_closes`(날짜별 종가 시리즈)를 실어 나름 → posts.json 저장 직전 제거(이력 파일 전용).
- `archiveHistory()` → `public/data/history.json`에 **날짜 정확** upsert:
  ```
  { "YYYY-MM-DD": {
      "prices": { "종목명": 종가, ... },        // 그날 전 종목 종가(미래 T+N 조회용)
      "indices": { "KOSPI": n, "KOSDAQ": n },
      "opinions": [ { person, stock, stance, market } ]  // 그날 의견, person+stock 중복제거
  } }
  ```
- **핵심**: `_closes` 시리즈로 posts.json에 남은 의견 구간(약 8일)을 날짜 정확하게 채움 →
  **매 실행이 자동 백필**. 별도 백필 스크립트 불필요. 실행 즉시 07-10~07-16 5거래일 확보됨.
- 가격 없는 종목의 의견은 제외(판정 불가). 오늘(장 마감 전)은 종가 미확정이라 다음 실행에 완성.
- `.github/workflows/collect.yml`에 history.json git add 추가 (fresh checkout 소실 방지).
- 최근 120일치 유지.

## Phase 2 — 적중 판정 (백필로 앞당겨짐: 07-13 코호트가 07-20(월)부터 판정 가능, 미구현)
- `scripts/hitrate.js` 신설 (judge.js처럼 순수 JS, AI 미사용, 결정적):
  - 각 의견 (person, stock, stance, date T)에 대해 history에서 price(T), price(T+5td), price(T+20td), 같은 창의 index 수익률 조회
  - 초과수익 계산 → 적중/미적중. 아직 T+Nd 데이터 없으면 pending.
  - person별 집계: {hits, total, rate} × {5일, 20일}. **min 표본(예: 5건) 미만은 "표본부족"으로 rate 숨김.**
- posts.json에 `source_scores` 저장. 골든 케이스 회귀테스트 추가(tests/regression.mjs).

## Phase 3 — UI (미구현)
- 소스별 신뢰 점수 패널. **매매추천 오해 방지**(판정 배지 뺐던 교훈) → "N일 적중 X/Y" 사실만, 점수 랭킹은 신중히.
- 표본부족 소스는 명시적으로 "표본부족" 표기 (침묵 truncation 금지).

## 범위/주의
- Phase 1만 이번 세션. Phase 2·3은 데이터 축적 후 별도 세션 (스펙 → 골든케이스 → 코드 순).
- US 벤치마크 지수 수집이 Phase 2 선행 과제.
