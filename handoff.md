# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-07-08 (세션 6)

---

## 현재 상태: 주간 트렌드 + 스파이크 감지 배포 완료 ✅

### 세션 6에서 완료된 것

- [x] **DailyBrief 타임스탬프** — generatedAt 표시 + 모바일 flexWrap
- [x] **collect-rss.js daily_briefs 배열 마이그레이션** — daily_brief(단수) → daily_briefs(배열, 최대 7개)
- [x] **하루 1회 캐싱** — 오늘 날짜 브리핑이 이미 있으면 Claude API 호출 생략
- [x] **TDZ 버그 수정** — existingBrief 선언 전 사용 오류 해결
- [x] **WeeklyTrend 컴포넌트** — 최근 7일 hot_stocks 언급 빈도 막대그래프 (보라색 테마)
- [x] **SpikeAlert 컴포넌트** — 오늘 ≥2회 언급 + 전일 대비 2배 이상 종목 자동 표시 (빨간 테마)
- [x] **텔레그램 알림 코드** — collect-rss.js에 sendTelegram() 함수 추가, collect.yml secrets 연결
- [x] **Git 복구** — catastrophic temp-index commit 이후 refs/heads/main 수동 복구 완료
- [x] GitHub push 완료 (커밋 7370f10 → 9a46d9d → 7f5bedd)
- [x] Vercel 배포 확인 — WeeklyTrend "삼성전자 3/3일" 렌더링 확인

### ⚠️ 텔레그램 알림 — 코드 완성, Secrets 미등록

코드는 완성됐지만 GitHub Secrets가 아직 등록 안 됨. 다음 세션 또는 PC/폰 브라우저에서 직접 추가 필요:

1. https://github.com/Dremandream/naver-blog-dashboard/settings/secrets/actions/new
   - Name: `TELEGRAM_BOT_TOKEN`
   - Secret: (봇 토큰 — 채팅에서 확인)
2. 같은 URL에서
   - Name: `TELEGRAM_CHAT_ID`
   - Secret: `88580301`

등록 후 `fix_and_push.bat` 실행 → 내일 오전 8시부터 자동 알림

---

## 현재 아키텍처

```
매일 KST 08:00 GitHub Actions 자동 실행
  → collect-rss.js 실행
  → 10개 블로그 RSS fetch (오늘 + 어제)
  → Claude Haiku AI 분석
  → daily_briefs 배열 업데이트 (최대 7일치)
  → 7일 히스토리 병합 저장 → posts.json
  → 텔레그램 브리핑 발송 (Secrets 등록 후 활성화)
  → Vercel 자동 배포
```

---

## 현재 대시보드 기능

- 📰 **DailyBrief** — 오늘 브리핑 + 합의/이견/공통종목 + 생성시각
- ⚡ **SpikeAlert** — 급증 종목 자동 감지 (데이터 축적 후 표시)
- 📊 **WeeklyTrend** — 7일 종목 언급 빈도 막대 그래프
- 섹터/블로그/날짜 필터, 종목 태그 검색, 카드 모달

---

## 핵심 파일 위치

```
naver-blog-dashboard/
├── config/blogs.json
├── scripts/collect-rss.js        # RSS + AI + daily_briefs + 텔레그램
├── public/data/posts.json        # 7일치 누적 데이터
├── src/App.jsx
├── src/components/DailyBrief.jsx
├── src/components/WeeklyTrend.jsx  ← 세션 6 신규
├── src/components/SpikeAlert.jsx   ← 세션 6 신규
├── src/components/PostCard.jsx
├── src/components/PostModal.jsx
├── src/components/FilterBar.jsx
├── src/components/StatsBar.jsx
├── fix_and_push.bat              # 빌드+커밋+push (index.lock/HEAD.lock 자동 제거)
└── .github/workflows/collect.yml
```

---

## 알려진 이슈 / 주의사항

- `HEAD.lock` / `index.lock` 충돌 → `fix_and_push.bat`이 자동 제거함
- Cowork에서 파일 수정 → Claude Code에서 push → 충돌 가능 → "로컬 유지" 선택 시 Cowork 수정본 유실
- SpikeAlert은 데이터가 2일 이상 쌓여야 표시됨 (정상)
- WeeklyTrend는 2일 이상 연속 언급 종목만 표시됨 (정상)
- fix_and_push.bat: 배치 파일 안에 한국어 경로 있으면 CP949 인코딩 오류 → ASCII만 사용

---

## 다음 세션 시작 방법
1. 이 파일 첨부
2. "이어서 진행해줘" 입력

## 남은 개선 아이디어 (구현 전 필요성 확인)
- ~~블로거 신뢰도 점수~~ → 제거 (이미 검증된 블로거만 등록, 불필요)
- 텔레그램 알림 → GitHub Secrets 등록 후 활성화 대기 중
- 뉴스 크로스체크 (외부 API 필요)
