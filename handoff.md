# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-06-17

---

## 현재 상태: 전체 파이프라인 정상 작동 중 ✅

### 완료된 것
- [x] RSS 피드 작동 검증 (keumssoa, audistar, doctordk 3개 블로그)
- [x] config/blogs.json 생성
- [x] scripts/collect-rss.js 작성 (Claude AI 요약 포함)
- [x] collect.yml 수정 (Playwright 제거 → collect-rss.js)
- [x] GitHub Secrets에 CLAUDE_API_KEY 등록
- [x] GitHub Actions 수동 실행 성공 (#9, #10)
- [x] AI 요약 정상 동작 확인 (sector, signal, key_points 채워짐)
- [x] Vercel 대시보드에서 실제 글 + AI 요약 확인
- [x] 매일 KST 08:00 자동 실행 스케줄 가동 중

### 현재 동작 확인된 것
- 대시보드 URL: https://naver-blog-dashboard.vercel.app
- 최근 수집: 2026-06-17 기준 8개 글 (AI 요약 포함)
- 매수 3개 / 중립 5개 / 매도 0개 분류 정상

### 다음 세션: 개선 작업 예정
- 개선 항목은 plan.md에서 관리

---

## 다음 세션 시작 방법

1. 이 파일 첨부
2. "개선 작업 이어서 해줘" 입력
3. plan.md 확인 후 시작

---

## 핵심 파일 위치
```
naver-blog-dashboard/
├── CLAUDE.md                    # 프로젝트 원칙 (필독)
├── plan.md                      # 단계별 계획 (개선 항목 포함)
├── handoff.md                   # 이 파일
├── config/blogs.json            # 이웃 블로그 목록 (추가 시 여기만 수정)
├── scripts/collect-rss.js       # RSS 수집 + Claude AI 요약 메인 스크립트
├── scripts/test-rss.js          # RSS 테스트용
├── public/data/posts.json       # 수집 데이터 (Actions가 자동 업데이트)
├── src/                         # React 대시보드
├── template/                    # 반복 작업 템플릿
└── .github/workflows/collect.yml # GitHub Actions (매일 KST 08:00)
```

---

## 핵심 교훈 (잊지 말 것)
- Playwright → Naver 봇 차단으로 실패. 다시 쓰지 말 것
- RSS는 인증 없이 작동. 이 방식 유지
- 개선 전 반드시 plan.md 작성 먼저
- "완료"를 말로 두지 말고 Vercel 대시보드에서 직접 눈으로 확인
