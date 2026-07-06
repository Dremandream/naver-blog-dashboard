# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-07-07 (세션 5)

---

## 현재 상태: 정보 밀도 업그레이드 배포 대기 중

### 세션 5에서 완료된 것 (Cowork에서 파일 수정 완료)
- [x] 본문 전문 수집: m.blog.naver.com 단순 HTTP fetch (검증: HTTP 200, 2,162자 추출 성공)
- [x] AI 분석 입력 2000자 → 6000자
- [x] 프롬프트 새 필드: numbers(핵심 수치), stance(강세/약세/중립 논조), reasoning(핵심 근거), risks(리스크)
- [x] PostCard: 수치 칩 + 강세/약세 뱃지 (중립은 숨김 — signal 교훈)
- [x] PostModal: 요약→수치→근거→리스크→포인트 구조화
- [x] 로컬 실행 검증 (3건 수집 성공, posts.json은 되돌림)
- [x] scripts/test-fetch-body.js 추가 (본문 수집 검증용, 유지)

### 세션 5 남은 것
- [ ] git push (Claude Code) → Vercel 배포
- [ ] GitHub Actions 수동 실행 → 새 필드 채워진 데이터 확인
- [ ] Vercel에서 눈으로 확인 (수치 칩, stance 뱃지)
- [ ] stance가 전부 중립으로만 나오면 → 다음 세션에서 stance 제거 검토

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
