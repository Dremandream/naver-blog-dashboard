# plan.md — 정보 밀도 업그레이드 (세션 5)

> 이전 계획(RSS 구축 + UI 개선)은 전부 완료됨. 이 파일은 세션 5 계획으로 교체.

## 목표
원글 클릭 없이 대시보드만으로 판단 가능한 수준의 AI 요약.

## 진단
- 병목은 프롬프트가 아니라 입력 데이터: RSS description 2000자 잘림 + 일부 블로그(피터케이 등) 본문 없음
- 본문 있는 글(콤디티 등)은 이미 수치 추출 잘됨 → 본문만 확보하면 전체 품질 상승

## 결정 (사용자 확인 완료)
1. 본문 전문 수집: m.blog.naver.com 단순 HTTP fetch (Playwright 아님)
2. 프롬프트 개선: 새 필드 추가 (아래)
3. UI: 카드 + 모달 둘 다 반영

## 검증 (구현 전 필수)
- [ ] `node scripts/test-fetch-body.js` → 본문 2000자 이상 추출 확인 (Claude Code에서 실행 OK)
- 실패 시: HTML 구조 확인 후 파서 수정. 그래도 안 되면 본문 수집 포기하고 프롬프트 개선만 진행

## 변경 파일

### 1. scripts/collect-rss.js
- `fetchFullContent(url)` 추가: 모바일 페이지에서 본문 추출, 실패 시 RSS description 폴백 (기존 동작 유지)
- 본문 입력 한도: 2000자 → 6000자
- 프롬프트 새 필드:
  - `numbers`: 글에 나온 구체 수치 (목표가, 실적 전망, 상승률 등)
  - `stance`: 강세|약세|중립|해당없음 — 글쓴이의 톤. signal 교훈: 전부 중립이면 제거
  - `reasoning`: 주장의 핵심 근거 1문장
  - `risks`: 글쓴이가 언급한 리스크/반대 논거

### 2. src/components/PostCard.jsx
- numbers 수치 배지 한 줄, stance 뱃지 (중립/해당없음이면 숨김)

### 3. src/components/PostModal.jsx
- 구조화: 요약 → 핵심 수치 → 근거 → 리스크 → 핵심 포인트

### 4. src/App.css
- 새 클래스 스타일만 추가. 필터 로직 변경 없음.

## 하위호환
- 기존 글엔 새 필드 없음 → UI는 `post.numbers?.length` 옵셔널 처리
- 7일 후 자연스럽게 새 데이터로 채워짐

## 완료 기준
1. `node scripts/collect-rss.js` 로컬 실행 성공, 새 필드 채워짐
2. 기존+새 데이터 혼재 시 UI 안 깨짐 (`npm run dev`)
3. git push (Claude Code) → Vercel 배포 → 눈으로 확인

## 작업 분담 (충돌 방지)
- 파일 수정: Cowork (이 세션)
- 스크립트 실행 / git: Claude Code — 단, 파일 수정은 하지 않기

---

# 추가: 일별 종합 브리핑 (세션 5b)

## 배경
사용자 의문: "요약만 보면 깊은 사고가 사라진다. 대시보드가 필요한가?"
→ 결론: 대시보드 역할 = 판단 대체가 아니라 **선별 + 비교**.
→ 개별 글 요약으론 안 되는 것: 블로거 간 합의/이견 비교. 이걸 브리핑으로 제공.

## 원칙
- "판단/추천" 아님. 합의·이견·근거 비교만. (signal 실패 교훈)
- 업종별 판단 칸은 만들지 않기로 결정 (글 수 부족, 판단 프레임 위험)

## 구조
1. collect-rss.js: 개별 분석 후 `generateDailyBrief(results)` 1회 호출
   - 입력: 그날 수집 글들의 {blog_name, title, sector, stance, summary, numbers}
   - 출력: { headline, brief, consensus[], divergence[], hot_stocks[] }
   - posts.json에 `daily_brief: { date, ...}` 최상위 필드로 저장
   - 글 0개면 스킵(기존 early return), 1개면 비교 없이 요약만 하도록 프롬프트에 명시
2. src/components/DailyBrief.jsx 신규: 대시보드 최상단 브리핑 카드
   - daily_brief 없으면 렌더링 안 함 (하위호환)
3. App.jsx: StatsBar 위에 <DailyBrief brief={data?.daily_brief} />
4. App.css: 브리핑 카드 스타일

## 완료 기준
- Actions 실행 후 posts.json에 daily_brief 생성
- Vercel 대시보드 최상단에 브리핑 카드 표시
- 이견(divergence)이 실제로 의미 있는 내용인지 눈으로 확인
