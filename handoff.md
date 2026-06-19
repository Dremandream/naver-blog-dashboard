# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-06-19 (세션 4)

---

## 현재 상태: 안정 운영 중 ✅

### 세션 4에서 완료된 것
- [x] 블로그 닉네임 반영 (피터케이, 선진짱, Teddy 미술관, 너쟁이, 씹배, 잠실개미, 혀니루)
- [x] signal 기능 완전 제거 (UI + 프롬프트 + 저장 로직)
- [x] 본문 없는 블로그도 AI 분석 실행 (content 길이 조건 제거)
- [x] post ID 안정화 (`blog_id_날짜_포스트번호` 형태 → 중복 방지)
- [x] 7일 히스토리 누적 저장 (매일 덮어쓰기 → 누적 병합으로 변경)

### 현재 아키텍처

```
매일 KST 08:00 GitHub Actions 자동 실행
  → collect-rss.js 실행
  → 10개 블로그 RSS fetch (오늘 + 어제)
  → Claude Haiku AI 분석 (sector, summary, stocks, key_points)
  → 기존 posts.json과 병합 (7일치 유지, 중복 제거)
  → Vercel 자동 배포
  → 대시보드 갱신
```

### 현재 대시보드 기능
- 섹터 필터 / 블로그 필터 / 날짜 필터 / 정렬
- 카드 클릭 → 상세 모달
- 종목 태그 클릭 → 검색 필터
- StatsBar: 전체 글 수 + 섹터별 글 수

### 현재 데이터 현황 (2026-06-19 기준)
- 블로그 10개, 글 8개 (히스토리 누적 시작일)
- 7일 후부터 70~80개 수준 예상

---

## 핵심 파일 위치

```
naver-blog-dashboard/
├── config/blogs.json          # 블로그 10개 + 닉네임
├── scripts/collect-rss.js     # RSS 수집 + AI 요약 + 7일 누적 저장
├── public/data/posts.json     # 수집 데이터 (7일치 누적)
├── src/App.jsx                # 메인 (필터/정렬/모달 state)
├── src/components/PostCard.jsx
├── src/components/PostModal.jsx
├── src/components/FilterBar.jsx
├── src/components/StatsBar.jsx
└── .github/workflows/collect.yml
```

---

## 알려진 이슈 / 주의사항
- git push 시 `.git/index.lock` 충돌 자주 발생 → Claude Code에서 `del .git\index.lock` 후 재시도
- Cowork에서 파일 수정 후 Claude Code에서 push 시 충돌 가능 → "로컬 유지" 선택 시 Cowork 수정본이 날아갈 수 있음. push 후 파일 상태 확인 필요

---

## 다음 세션 시작 방법
1. 이 파일 첨부
2. "이어서 진행해줘" 입력

## 남은 개선 아이디어
- 카카오톡 / 이메일 알림 (특정 종목 언급 시)
- 모바일 UI 최적화
- 블로그 추가
