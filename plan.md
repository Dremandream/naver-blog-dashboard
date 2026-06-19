# plan.md — RSS 기반 네이버 블로그 투자 대시보드

## 현재 상태
- RSS 피드 작동 검증 완료 ✅ (keumssoa, audistar, doctordk)
- 기존 Playwright 방식 폐기 (Naver 봇 차단으로 실패)
- React 대시보드 + GitHub Actions + Vercel 인프라는 유지

---

## 목표
이웃 블로그 RSS → Claude AI 투자 요약 → React 대시보드 (매일 자동)

---

## 단계별 계획

### Step 1. 블로그 목록 파일 만들기
**완료 기준:** `config/blogs.json` 파일에 블로그 ID 목록 저장
**사람 확인:** 블로그 ID가 맞는지 직접 확인 후 승인
**작업:**
- `config/blogs.json` 생성
- 현재 3개 (keumssoa, audistar, doctordk) 입력
- 나중에 이웃 추가 시 이 파일만 수정하면 됨

```json
{
  "blogs": [
    { "id": "keumssoa", "name": "금싸" },
    { "id": "audistar", "name": "콤디티" },
    { "id": "doctordk", "name": "의교창" }
  ]
}
```

---

### Step 2. RSS 수집 스크립트 작성
**완료 기준:** `node scripts/collect-rss.js` 실행 시 3개 블로그 최신 글 출력
**사람 확인:** 실행 결과 직접 확인
**작업:**
- `scripts/collect-rss.js` 작성
- blogs.json 읽기 → 각 RSS fetch → 오늘 날짜 글만 필터
- 결과를 콘솔에 출력 (아직 저장 안 함)

---

### Step 3. 로컬 검증 ← 사람 승인 필요
**완료 기준:** 실제 투자 블로그 글이 콘솔에 정상 출력됨
**사람 확인:** 출력된 글 목록이 맞는지 직접 눈으로 확인 후 "진행해줘"
**중요:** 이 단계 통과 전까지 다음 단계 진행 금지

---

### Step 4. Claude AI 요약 추가
**완료 기준:** 각 글에 sector, signal, summary, key_points 추가됨
**사람 확인:** AI 요약 결과 샘플 확인
**작업:**
- analyzePost() 함수 추가 (기존 코드 재사용)
- 결과를 posts.json 형식으로 콘솔 출력

---

### Step 5. posts.json 저장
**완료 기준:** `public/data/posts.json` 파일이 올바른 형식으로 저장됨
**사람 확인:** 파일 내용 직접 확인
**작업:**
- 콘솔 출력 → 파일 저장으로 변경
- 기존 오늘 데이터가 있으면 병합, 없으면 새로 생성

---

### Step 6. GitHub Actions 연결
**완료 기준:** GitHub Actions 수동 실행 시 posts.json이 올바르게 업데이트됨
**사람 확인:** Actions 로그 확인 + Vercel 대시보드에서 실제 글 확인
**작업:**
- collect.yml 수정 (Playwright 제거, collect-rss.js 실행)
- CLAUDE_API_KEY Secret만 필요 (NAVER_COOKIE 불필요)
- 테스트 실행

---

### Step 7. 자동 스케줄 확인
**완료 기준:** 매일 KST 08:00 자동 실행 확인
**사람 확인:** 다음날 아침 대시보드 확인
**작업:**
- cron 설정 확인 (이미 있음)
- 완료

---

## 진행 상태

| Step | 상태 | 비고 |
|---|---|---|
| Step 1. blogs.json | ✅ 완료 | |
| Step 2. collect-rss.js | ✅ 완료 | |
| Step 3. 로컬 검증 | ✅ 완료 | 사람 확인 완료 |
| Step 4. Claude AI 요약 | ✅ 완료 | sector/signal/key_points 정상 |
| Step 5. posts.json 저장 | ✅ 완료 | |
| Step 6. GitHub Actions | ✅ 완료 | 사람 확인 완료 (#10 Success) |
| Step 7. 스케줄 확인 | ✅ 완료 | 매일 KST 08:00 가동 중 |

---

## Phase 2 — UI 개선 작업

### P2-1. 글 상세 보기 (모달)
**완료 기준:** 카드 클릭 시 모달 팝업 — 전체 요약, signal_reason, key_points, 블로그 원문 링크 표시
**사람 확인:** Vercel에서 카드 클릭 → 모달 동작 확인
**파일:** `src/components/PostModal.jsx` 신규 + `PostCard.jsx` 수정 + `App.css` 추가

### P2-2. 필터 개선
**완료 기준:** 아래 4가지 모두 작동
- 날짜 필터: 오늘 / 어제 / 최근 7일 버튼
- 블로그별 필터: 블로그 이름 드롭다운 또는 버튼
- 종목 태그 클릭 → 해당 종목으로 즉시 검색 필터링
- 정렬: 최신순 / 매수 우선 / 블로그별
**사람 확인:** 각 필터 눌러서 결과 확인
**파일:** `src/components/FilterBar.jsx` 수정 + `App.jsx` state 추가

### 구현 순서
1. P2-1 모달 먼저 (독립 컴포넌트, 안전)
2. P2-2 필터 개선 (App.jsx state 변경 필요)
3. 각 단계 완료 후 git push → Vercel 확인

| 항목 | 상태 |
|---|---|
| P2-1. 글 상세 모달 | ⬜ 대기 |
| P2-2. 필터 개선 | ⬜ 대기 |

---

## 절대 원칙
- 개선 작업도 구현 전 plan 먼저
- 막히면 구현 계속하지 말고 즉시 보고
- "완료"는 Vercel 대시보드에서 직접 눈으로 확인
