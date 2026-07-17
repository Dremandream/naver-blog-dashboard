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

## Phase 2 — 적중 판정 (이번 세션 완료 ✅)
- `scripts/hitrate.js` (judge.js처럼 순수 JS, AI 미사용, 결정적):
  - 각 의견 (person, stock, stance, date T)에 history의 정렬 거래일 리스트에서 T+5·T+20칸 뒤 조회
  - 초과수익 = 종목수익률 − 벤치마크(KR=KOSPI, US=NASDAQ)수익률. 강세는 >0, 약세는 <0 이면 적중.
  - T 또는 T+N 종가/지수 결손 시 pending(집계 제외). person별 {hits,total,rate}×{5,20}.
  - MIN_SAMPLE=5 미만은 rate=null(UI 표본부족). 중립 제외.
- **US 벤치마크 지수 수집 추가**: fetchForeignIndexClosesDated로 나스닥(.IXIC)·S&P500(.INX) → market·history.indices에 NASDAQ/SP500 저장.
- posts.json에 `source_scores` 저장. 골든 케이스 7건 회귀테스트 추가(HR1~HR7, 총 38건 통과).

## Phase 3 — UI (이번 세션 완료 ✅)
- `src/components/SourceScores.jsx` — AttentionTrends 아래 배치. 소스별 의견수·5일·20일 적중.
- 적중률(표본충족)순 정렬. total<min은 "표본부족", 미성숙은 "판정중" 표기(침묵 절삭 금지).
- 전 소스 미성숙(오늘)이면 상단에 추적 시작 안내 배너. **"매매추천 아님, 사후 성과 기록" 명시.**

## 상태
- 오늘(07-17)은 5거래일 경과분이 없어 전부 "판정중". **07-13 코호트가 07-20(월)부터 실제 적중률 표시 시작.**
- 로직은 골든 케이스로 검증 완료(실데이터 성숙 전이라 라이브 수치는 월요일부터).
