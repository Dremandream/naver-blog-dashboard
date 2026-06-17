# 네이버 블로그 투자 대시보드 - 프로젝트 규칙

## 프로젝트 개요
네이버 이웃 블로그(투자 관련) 글을 자동 수집 → Claude AI 투자 요약 → React 대시보드

## 핵심 원칙

### 1. 작게 시작
- 새 기능은 반드시 소규모 테스트 먼저 (예: 3개 블로그 → 성공 → 전체 확장)
- 전체 시스템 구축 전에 핵심 부분이 작동하는지 먼저 검증

### 2. 구현 전 검증 필수
- 코드 작성 전에 방식이 실제로 작동하는지 확인
- sandbox 또는 사용자 브라우저로 검증 후 진행
- "될 것 같다"는 추측으로 구현 금지

### 3. 멈춰야 하는 신호
- 같은 방식으로 3회 이상 실패 → 즉시 방향 재검토
- plan 없이 구현부터 시작하고 있다면 → 멈추고 plan 먼저
- 도구가 문제인지 접근법이 문제인지 먼저 판단

### 4. 순서 준수
```
검증(소규모 테스트) → plan.md 작성 → 구현 → verification
```

### 5. 도구 선택 기준
- 복잡한 도구(Playwright 등) 전에 단순한 방법(RSS, HTTP fetch) 먼저 시도
- 작동하는 가장 단순한 방법을 선택

---

## 현재 확정 스택

| 역할 | 도구 |
|---|---|
| 블로그 수집 | Naver RSS 피드 (인증 불필요) |
| 투자 요약 | Claude API (claude-haiku-4-5-20251001) |
| 자동화 | GitHub Actions (매일 KST 08:00) |
| 데이터 저장 | public/data/posts.json |
| 대시보드 | React + Vite |
| 호스팅 | Vercel |

## 왜 Playwright를 버렸나
- Naver section.blog.naver.com은 AngularJS SPA + 봇 차단이 매우 강함
- 쿠키 2개(NID_AUT + NID_SES)만으로는 SympathyList 접근 불가
- RSS 피드는 인증 불필요, 봇 차단 없음 → 검증 완료

---

## 이웃 블로그 목록 (config/blogs.json 관리)
테스트 완료 후 추가 예정

---

## 실행 명령어

```bash
# RSS 테스트 (3개 블로그)
node scripts/test-rss.js

# 전체 수집 실행
node scripts/collect-rss.js

# 로컬 개발 서버
npm run dev
```

---

## GitHub Secrets
- `CLAUDE_API_KEY` - Anthropic API 키
- (쿠키 불필요 - RSS 방식)

---

## 과거 실패 이력 (반복 금지)
- Playwright + section.blog.naver.com → Access Denied (봇 차단)
- CSS 셀렉터 방식 → AngularJS SPA에서 불안정
- NID_AUT + NID_SES 쿠키만으로 SympathyList 접근 → 빈 페이지
