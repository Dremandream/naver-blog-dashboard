# CLAUDE.md — 네이버 블로그 투자 대시보드

> 이 파일을 먼저 읽고 시작하라. 수많은 실패에서 얻은 실전 규칙이다.

---

## 프로젝트 개요
- 목적: 투자 블로거 10명의 RSS 수집 → Claude AI 분석 → React 대시보드 자동 표시
- URL: https://naver-blog-dashboard.vercel.app
- 스택: Node.js RSS 수집 + Claude Haiku API + React/Vite + GitHub Actions + Vercel

## 핵심 파일
| 파일 | 역할 |
|---|---|
| config/blogs.json | 블로그 10개 목록 + 닉네임 |
| scripts/collect-rss.js | RSS 수집 + AI 분석 + 7일 누적 저장 |
| public/data/posts.json | 수집 데이터 (7일치) |
| src/App.jsx | 메인 컴포넌트 |
| .github/workflows/collect.yml | 매일 KST 08:00 자동 실행 |
| handoff.md | 세션 간 인수인계 (새 세션 시작 시 반드시 첨부) |

---

## 절대 원칙 3가지

### 1. 기능 만들기 전에 먼저 물어라
- 구현 전 반드시: "이 기능이 실제로 필요한가?" 한 번 확인
- 교훈: signal 기능 → 완성 후 "다 중립이야" 삭제 → 낭비

### 2. Cowork + Claude Code 동시에 같은 파일 건드리지 않는다
- Cowork에서 파일 수정 → Claude Code에서 git push → 충돌 → 잘못된 버전 배포
- 규칙: 파일 수정은 Cowork, git 작업은 Claude Code. 같은 날 두 표면이 같은 파일을 건드리지 않는다.

### 3. 검증 → 구조 → 구현. 이 순서를 절대 바꾸지 마라
- 작동하는 최소 단위 먼저 확인
- plan.md 작성 후 구현 시작
- 완료 = Vercel에서 직접 눈으로 확인

---

## 표면 선택

| 표면 | 언제 |
|---|---|
| Chat | 빠른 질문, 1회성 탐색 |
| Projects | 반복 배경이 필요한 작업 |
| Cowork | 파일 수정, 코드 실행, 자동화 구축 |
| Code (CLI) | git 작업, 터미널, 대규모 코드 |

---

## 멈춰야 하는 신호

| 신호 | 대응 |
|---|---|
| 같은 파일 충돌이 2번 이상 발생 | Cowork와 Code 중 하나만 쓰는 방식으로 전환 |
| 같은 방식으로 3번 실패 | 즉시 방법 바꾸기 |
| plan.md 없이 구현 시작 | 멈추고 plan.md 먼저 |
| 기능 만들고 나서 필요성 논의 | 다음엔 구현 전에 필요성 확인 |

---

## 새 세션 시작 루틴
1. handoff.md 첨부
2. "이어서 진행해줘" 입력
3. Claude가 현재 상태 확인 후 시작

---

## 프롬프트 요청 기준
모든 작업 요청에 아래를 포함하면 결과가 달라진다:
1. **어떤 파일** — 수정 대상 명시
2. **무엇을** — 구체적인 변경 내용
3. **완료 기준** — 어떻게 확인할지
4. **불확실하면** — 추측하지 말고 물어볼 것

---

## 알려진 이슈
- git push 시 `.git/index.lock` 충돌 자주 발생 → `del .git\index.lock` 후 재시도
- Cowork 수정 후 Claude Code push 시 충돌 → "로컬 유지" 선택 시 Cowork 수정본 유실 가능
- RSS 본문 없는 블로그(피터케이 등) → 제목만으로 AI 분석 (정상 동작)
