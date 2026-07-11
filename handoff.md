# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-07-11 (세션 9)

---

## 세션 9에서 완료된 것 — 텔레그램 채널 통합 ✅

- [x] **텔레그램 공개 채널 3개 통합 수집** — 투자콤(comvestment), 잠실개미(텔레)(jake8lee), IT는 SK(skitteam)
  - 수집 방식: `t.me/s/{채널}` 웹 미리보기 스크래핑 (인증 불필요, 공개 채널만)
  - `config/telegram-channels.json` 신규
  - `collect-rss.js`: `fetchTelegramChannel()`, `parseTelegramMessages()`, `stripHtml()` 추가
  - 채널별로 **하루치 메시지를 1개 글로 병합** 후 기존 `analyzePost` 파이프라인에 투입 → 종합 브리핑 자동 통합
  - 각 글에 `source: 'telegram' | 'blog'` 필드 추가
- [x] **PostCard 텔레그램 배지** — `source==='telegram'`일 때 "📱 텔레그램" 표시 (App.css `.source-telegram`)
- [x] **버그 수정 2건** — (1) 긴 텔레그램 글 JSON 잘림 → `max_tokens` 1200→1800, (2) sector 다중값("반도체|거시경제") → 첫 번째만 사용
- [x] **텔레그램 채널 5개** — 투자콤, 잠실개미(텔레), IT는 SK, 캬오의 공부방, 너쟁이(텔레)
- [x] **브리핑 라벨 자연스럽게** — 합의→공통 시각, 이견→엇갈린 시각, 공통 언급→함께 주목한 종목, 주간 합의 트렌드→주간 관심 종목 트렌드
- [x] **소스 필터** — FilterBar에 블로그/텔레그램 필터 추가 (App.jsx `selectedSource`)
- [x] **텔레그램 제목 개선** — analyzePost에 `headline` 필드 추가 → 텔레그램 카드는 AI 헤드라인 사용
- [x] **MarketPulse (신규)** — 오늘 섹터 분포 도넛 + 강세/약세/중립 비율 막대
- [x] **TodayStocks (신규)** — 전 소스 통합 종목별 언급수 + 강세/약세 비율 바
- [x] **투자자 관점 개선** — (1) 카드에 리스크(bear case) 한 줄 노출 → 확증편향 방지, (2) 핵심종목 '🔀 의견 갈림' 배지 → 강세·약세 갈리는 종목 부각(군중심리 방지)
- [x] **배포 완료** — Vercel 라이브 확인, 매일 KST 08:00 자동 수집에 텔레그램 포함

### 세션 9 신규/수정 파일
- `config/telegram-channels.json` (신규, 5채널)
- `scripts/collect-rss.js` — 텔레그램 수집·파싱, headline, source, 버그수정
- `src/components/MarketPulse.jsx` (신규), `src/components/TodayStocks.jsx` (신규)
- `src/components/FilterBar.jsx` (소스 필터), `PostCard.jsx` (배지·리스크), `DailyBrief.jsx`/`WeeklyTrend.jsx` (라벨)
- `src/App.jsx`, `src/App.css`

### 소스 적정선 메모 (사용자와 논의)
- 현재 총 15개 소스 (블로그 10 + 텔레그램 5). 적정 범위 15~20개.
- 25개 초과 시 `generateDailyBrief` max_tokens(1000) 상향 + SpikeAlert/WeeklyTrend 임계값 튜닝 필요.

### 텔레그램 수집 주의사항
- 공개 채널만 가능 (`t.me/s/채널명` 접속됨). 비공개면 수집 불가.
- 채널 추가: `config/telegram-channels.json`에 `{ "id": "채널핸들", "name": "표시이름" }`
- 채널 표시이름은 `t.me/s/{id}` 페이지 `og:title`에서 확인 가능

---

## 현재 상태 (세션 8): 전체 완성 ✅ — GitHub Actions #41 실제 실행 성공 확인

### 세션 8에서 완료된 것

- [x] **전체 점검 완료** — Fable 9개 개선사항 코드 전부 확인 (collect-rss.js, App.jsx, SpikeAlert.jsx, WeeklyTrend.jsx, collect.yml)
- [x] **Vercel 라이브 배포 확인** — DailyBrief, WeeklyTrend 정상 표시 (블로그 카드 37개)
- [x] **GitHub Actions 수동 실행 (#41) 성공** — 1분 49초, 커밋 c6d7b8f 기준, 전체 파이프라인 정상
- [x] **텔레그램 알림 미등록 결정** — 대시보드로 충분, 코드는 유지 (나중에 원하면 Secrets만 등록하면 됨)

### 세션 7에서 완료된 것

- [x] **KST 날짜 버그 수정** — `kstDate()` 함수로 UTC 오류 해결
  - collect-rss.js: `TODAY_KST`, `YESTERDAY_KST`, `WEEK_AGO_KST` 모두 KST 기준
  - App.jsx: `getKSTDate(0)` 캐시버스터 (UTC→KST)
- [x] **텔레그램 HTML parse_mode** — 마크다운 대신 HTML, `esc()` 이스케이프, 4000자 제한
- [x] **블로거 Set 기반 카운트** — SpikeAlert: 포스트 수 대신 고유 블로거 수 (Set)
- [x] **종목 별칭 정규화** — `config/stock-aliases.json` 추가 (하이닉스→SK하이닉스 등)
- [x] **RSS fetch 타임아웃** — 15초 AbortController + `!response.ok` 체크
- [x] **AI 응답 스키마 검증** — `normalizeArr()` 함수
- [x] **0결과 처리** — 기존 briefs 유지, 전체 실패 시 `process.exit(1)`
- [x] **종목 클릭 검색** — SpikeAlert/WeeklyTrend 클릭 → SearchQuery 연동 (`onStockClick`)
- [x] **collect.yml 충돌 방지** — `git pull --rebase origin main` 추가
- [x] **GitHub push 완료** — 커밋 c6d7b8f (세션 내 git index 부패 복구 포함)

### 텔레그램 알림 — 코드 완성, 등록 보류 (의도적 결정)

대시보드에서 직접 확인하는 방식으로 운영하기로 결정. 코드는 그대로 유지됨.
나중에 필요하면 GitHub Secrets만 등록하면 즉시 활성화:
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` = `88580301`
- URL: https://github.com/Dremandream/naver-blog-dashboard/settings/secrets/actions/new

---

## 현재 아키텍처

```
매일 KST 08:00 GitHub Actions 자동 실행
  → collect-rss.js 실행
  → 10개 블로그 RSS fetch (KST 오늘 + 어제, 15초 타임아웃)
  → Claude Haiku AI 분석 + 스키마 검증
  → 종목 별칭 정규화 (stock-aliases.json)
  → daily_briefs 배열 업데이트 (최대 7일치)
  → 7일 히스토리 병합 저장 → posts.json
  → 텔레그램 브리핑 발송 (Secrets 등록 후 활성화)
  → git pull --rebase + git push (충돌 방지)
  → Vercel 자동 배포
```

---

## 현재 대시보드 기능

- 📰 **DailyBrief** — 오늘 브리핑 + 합의/이견/공통종목 + 생성시각
- ⚡ **SpikeAlert** — 급증 종목 (고유 블로거 수 기준, 오늘 ≥2명 + 전일 대비 2배)
- 📊 **WeeklyTrend** — 7일 종목 언급 빈도 막대 그래프 (클릭→검색)
- 섹터/블로그/날짜 필터, 종목 태그 검색, 카드 모달

---

## 핵심 파일 위치

```
naver-blog-dashboard/
├── config/blogs.json
├── config/stock-aliases.json      ← 세션 7 신규 (종목 별칭)
├── scripts/collect-rss.js        # RSS + AI + daily_briefs + 텔레그램
├── public/data/posts.json        # 7일치 누적 데이터
├── src/App.jsx                   # KST 캐시버스터
├── src/App.css                   # hover 스타일
├── src/components/DailyBrief.jsx
├── src/components/WeeklyTrend.jsx  # onStockClick
├── src/components/SpikeAlert.jsx   # 블로거 Set 카운트 + onStockClick
├── src/components/PostCard.jsx
├── src/components/PostModal.jsx
├── src/components/FilterBar.jsx
├── src/components/StatsBar.jsx
├── fix_and_push.bat              # 빌드+커밋+push (lock 자동 제거)
├── unlock_and_commit.bat         # ← 세션 7 신규: 재귀 lock 제거 + 커밋
├── pull_push.bat                 # ← 세션 7 신규: pull --rebase + push
└── .github/workflows/collect.yml # git pull --rebase 추가
```

---

## 알려진 이슈 / 주의사항

- `HEAD.lock` / `index.lock` 충돌 → `unlock_and_commit.bat` 사용 (재귀 삭제 포함)
- `refs/heads/main.lock` 도 생길 수 있음 → `unlock_and_commit.bat`이 처리
- git push 전 `git pull --rebase` 필요 (GitHub Actions가 매일 posts.json 커밋)
- SpikeAlert은 데이터가 2일 이상 쌓여야 표시됨 (정상)
- WeeklyTrend는 2일 이상 연속 언급 종목만 표시됨 (정상)
- Cowork에서 파일 수정 → Claude Code에서 push → 충돌 가능 → "로컬 유지" 선택 시 Cowork 수정본 유실

---

## 다음 세션 시작 방법
1. 이 파일 첨부
2. "이어서 진행해줘" 입력

## 다음 개선 아이디어 (세션 8에서 논의, 구현 전 확인 필요)

기존 posts.json 데이터만으로 구현 가능한 것:
- **섹터 분포 도넛 차트** — 오늘 posts[].sector 집계, 어떤 테마가 뜨거운지 시각화
- **스탠스 비율 막대** — 강세/약세/중립 블로거 수 (posts[].stance), 시장 심리 요약
- **종목 히트맵** — 7일 × 상위 10종목 격자, 언급 많을수록 진한 색
- **블로거 성향 점수** — 블로거별 평균 강세/약세 성향 점수화

외부 API 필요한 것:
- 주가 크로스체크 — 블로거 예측 vs 실제 주가 등락 비교
- 뉴스 크로스체크

추천 구현 순서: 섹터 도넛 + 스탠스 비율 → 히트맵 → 블로거 성향
