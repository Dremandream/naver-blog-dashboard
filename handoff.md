# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-06-19 (세션 3)

---

## 현재 상태: 전체 파이프라인 + UI 개선 완료 ✅

### 세션 3에서 완료된 것
- [x] signal_reason UI 표시 push 완료 (세션 2 미완료 항목)
- [x] 글 상세 모달 (PostModal.jsx) — 카드 클릭 시 팝업, ESC/배경 클릭으로 닫기
- [x] 날짜 필터: 전체 / 오늘 / 어제 / 최근 7일
- [x] 블로그별 필터: 전체 + 블로그 이름 버튼
- [x] 정렬: 최신순 / 매수 우선 / 블로그별
- [x] 종목 태그 클릭 → 검색창 자동 필터링
- [x] 전체 검증 완료 (모달/날짜/블로그/정렬 모두 정상)

### 현재 동작 확인된 것
- 대시보드 URL: https://naver-blog-dashboard.vercel.app
- 블로그 10개, 매일 KST 08:00 자동 수집
- AI 요약: sector 11개, signal_reason 포함

---

## 다음 세션 시작 방법

1. 이 파일 첨부
2. "개선 작업 이어서 해줘" 입력

### 다음으로 할 수 있는 것 (미착수)
- 알림 기능 (카카오톡 / 이메일) — 매수 신호 글 나오면 알림
- 모바일 UI 최적화
- 블로그 추가

---

## 핵심 파일 위치
```
naver-blog-dashboard/
├── CLAUDE.md
├── plan.md
├── handoff.md                   # 이 파일
├── config/blogs.json            # 블로그 10개
├── scripts/collect-rss.js       # RSS 수집 + AI 요약
├── public/data/posts.json       # 수집 데이터
├── src/App.jsx                  # 메인 (필터/정렬/모달 state)
├── src/components/PostCard.jsx  # 카드 (클릭→모달, 종목태그→검색)
├── src/components/PostModal.jsx # 상세 모달
├── src/components/FilterBar.jsx # 날짜/섹터/블로그/시그널/정렬 필터
└── .github/workflows/collect.yml
```

---

## 핵심 교훈
- Playwright → Naver 봇 차단. RSS 방식 유지
- .git/index.lock 오류 → Claude Code 탭에서 `del .git\index.lock`
- 개선 전 plan.md 작성 먼저
- "완료"는 Vercel에서 직접 눈으로 확인
