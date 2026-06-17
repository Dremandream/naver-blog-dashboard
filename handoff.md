# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-06-15

---

## 현재 상태: RSS 방식으로 전환 완료, API 키 문제만 남음

### 완료된 것
- [x] RSS 피드 작동 검증 (keumssoa, audistar, doctordk 3개 블로그)
- [x] config/blogs.json 생성
- [x] scripts/collect-rss.js 작성
- [x] 로컬에서 7개 글 수집 성공
- [x] posts.json 저장 확인
- [x] CLAUDE.md 원칙 파일 작성
- [x] plan.md 작성

### 남은 것
- [ ] Claude API 키 로컬 적용 확인 (export 방식으로 재시도)
- [ ] posts.json에 AI 요약이 제대로 들어가는지 확인
- [ ] collect.yml 수정 (Playwright → collect-rss.js)
- [ ] GitHub Actions 수동 실행 + 결과 확인
- [ ] Vercel 대시보드에서 실제 글 확인

---

## 다음 세션 시작 방법

1. 이 파일 첨부
2. "이어서 해줘" 입력
3. 아래 명령어부터 시작

```bash
cd "/c/Users/simin/Claude/Projects/블로그 글 자동화 프로젝트/naver-blog-dashboard"
export CLAUDE_API_KEY=여기에실제키
node scripts/collect-rss.js
```

---

## 핵심 파일 위치
```
naver-blog-dashboard/
├── CLAUDE.md                    # 프로젝트 원칙 (필독)
├── plan.md                      # 단계별 계획
├── config/blogs.json            # 이웃 블로그 목록
├── scripts/collect-rss.js       # RSS 수집 메인 스크립트
├── scripts/test-rss.js          # RSS 테스트용
├── public/data/posts.json       # 수집 데이터
├── src/                         # React 대시보드
└── .github/workflows/collect.yml # GitHub Actions (아직 Playwright 방식 - 수정 필요)
```

---

## 오늘의 핵심 교훈
- Playwright → Naver 봇 차단으로 실패. 다시 쓰지 말 것
- RSS는 인증 없이 작동. 이 방식 유지
- plan 없이 구현 시작하지 말 것
- "완료"를 말로 두지 말 것
