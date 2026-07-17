# plan.md — 종합 리포트 간결화 (긍정/부정 × 산업별 재구조화)

## 목표 (2026-07-17, 사용자 합의 완료)
종합 리포트를 "결론 한 줄 + 긍정/부정 2단(산업별→종목별) + 소수의견"만으로 재구성.
내용은 줄이고 가독성을 높인다.

## 확정 사항 (AskUserQuestion으로 합의)
- 레이아웃: 긍정/부정 좌우 2단. 각 단 안에서 [산업] 그룹 → 종목 · 근거 1줄 (언급 N명)
- 유지: headline, 소수·역발상(최대 2줄)
- 제거: brief 요약문단, 말vs가격(관심추이 패널과 중복), 관전포인트(추후 촉매 캘린더로), 쏠림, hot_stocks 태그

## 변경 파일
1. `scripts/collect-rss.js` — generateDailyBrief 프롬프트/스키마 교체
   - 신규 스키마: `{ headline, positive: [{sector, items:[{name, point, mentions}]}], negative: [...], minority: [] }`
   - point = 25자 내외 한 구절 + 수치, mentions = person 기준 인원
2. `src/components/DailyBrief.jsx` — 신규 스키마 렌더. 구 스키마(지난 리포트 7일치)는 기존 레이아웃 폴백 유지
3. `src/App.css` — 산업 그룹/종목 행 스타일 (기존 report 토큰 재사용)

## 완료 기준
1. npm test 통과 + npm run build 성공
2. 오늘 브리핑 재생성 → posts.json에 신규 스키마 확인
3. 지난 날짜 칩 클릭 시 구 리포트 깨지지 않음
4. push → Vercel 라이브에서 눈으로 확인
