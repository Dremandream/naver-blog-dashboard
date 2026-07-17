# plan.md — 촉매 캘린더 (로드맵 §8-3, 소형)

## 배경 / 검증 결과
- 원래 아이디어: "watch_points를 날짜순 이벤트로"
- **문제 확인**: 세션 11 신 스키마(7/17~)에서 `watch_points` 제거됨. 구 데이터의 watch_points도 날짜 없는 자유 문장이라 캘린더 불가.
- → 이벤트 소스를 새로 만들어야 함.

## 설계

### 1. 데이터: Opus 브리핑에 `events` 필드 추가 (scripts/collect-rss.js)
- 신 스키마에 추가: `events: [{ date: "YYYY-MM-DD", label: "SK하이닉스 2Q 컨콜", stocks: ["SK하이닉스"], source: "너쟁이" }]`
- 프롬프트 지시: 글에서 **구체적 날짜/시기가 언급된 미래 이벤트만** 추출 (실적발표, 컨콜, FOMC, 계약협상 마감 등). 날짜 불명확("조만간")은 제외. 최대 6개. 없으면 빈 배열.
- "7월 말"처럼 대략적 시기는 그 달 말일로 정규화하고 `approx: true`.

### 2. 집계: 프론트에서 7일치 daily_briefs의 events 병합
- 별도 스크립트 없음. UI에서 `daily_briefs.flatMap(b=>b.events)` → 같은 (date+label 유사) 이벤트 중복 제거(먼저 나온 것 유지) → 오늘 이후만, 날짜 오름차순.

### 3. UI: `EventCalendar.jsx` 신설 → FactSidebar 하단에 배치
- 증권사 리포트 문법 유지: "주요 일정" 소제목 + 괘선 리스트. 한 줄 = `날짜 | 이벤트 | 관련종목 칩`.
- 지난 이벤트·이벤트 0건이면 섹션 자체 숨김 (빈 박스 금지).
- 시각 요소는 캘린더 그리드가 아니라 **날짜순 리스트** (모바일 대응 + 이벤트 수 적음).

### 4. 테스트/검증
- 브리핑 캐시 주의: 오늘 브리핑을 배열에서 제거 후 로컬 재실행하여 events 생성 확인.
- npm test 31/31 유지 (judge와 무관하지만 회귀 확인).
- 완료 기준: Vercel 라이브에서 사이드바에 일정 리스트 표시 확인.

## 범위 제외
- 캘린더 그리드 뷰, 이벤트 알림, 과거 이벤트 적중 여부 — 이번엔 안 함.

## 예상 변경 파일
| 파일 | 변경 |
|---|---|
| scripts/collect-rss.js | 브리핑 프롬프트 + 스키마에 events 추가 |
| src/components/EventCalendar.jsx | 신설 |
| src/components/FactSidebar.jsx | EventCalendar 삽입 |
