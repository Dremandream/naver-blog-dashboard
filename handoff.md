# Handoff — 네이버 블로그·텔레그램 투자 리서치 대시보드

## 마지막 업데이트
2026-07-17 (세션 12, Claude Code CLI / Fable 5)

> ⚠️ 이 문서는 다음 세션(더 작은 모델 포함)이 그대로 이어받을 수 있게 작성됨.
> 규칙: **CLAUDE.md 필독** → 기능 만들기 전 필요성 확인 / 검증→구조→구현 / 완료=라이브 확인.

---

## 1. 현재 상태: 전체 완성, 라이브 운영 중 ✅

- **URL**: https://naver-blog-dashboard.vercel.app
- **자동화**: GitHub Actions 매일 KST 08:00 (`.github/workflows/collect.yml`) → 수집→분석→push→Vercel 자동배포
- **소스 19개**: 블로그 10 (`config/blogs.json`) + 텔레그램 9 (`config/telegram-channels.json`) — 2026-07-17 혀니루 삭제(6개월 휴면), 사용자 지명으로 '너는 무한하지 않느냐'(블로그 cybermw)·'피카츄 아저씨'(텔레 pikachu_aje) 추가. 반도체·거시 편중 여전 → 추가는 타섹터(2차전지·바이오·금융)만
- **모델 배분(의도된 설계, 바꾸지 말 것)**: 개별 글 분석 = `claude-haiku-4-5-20251001` / 종합 리포트 = `claude-opus-4-8` (하루 1회)

## 2. 대시보드 구성 (위→아래)

| 섹션 | 컴포넌트 | 내용 |
|---|---|---|
| 🌃 시황 스트립 | `MarketStrip.jsx` | 코스피/코스닥 지수(1일/5일) + 개인/외인/기관 순매수(억원) |
| 📊 종합 리포트 | `DailyBrief.jsx` | 결론→요약→📈강세/📉약세 논거→🔍소수·역발상→⚖️말vs가격→🎯관전포인트→종목 |
| 🔎 종목 관심 추이 | `AttentionTrends.jsx` | 7일 언급 인원 + 최근2일vs이전2일 변화(🆕신규/▲급증/▼둔화) + 주가 1일/5일 + 🔀의견갈림 + 시각전환. **행 클릭→종목 리포트** |
| 📄 종목 리포트(모달) | `StockReport.jsx` | 현재가+등락, 종목별 모든 소스의 강세/약세 시각·수치·리스크·원문링크 |
| 개별 글 | `PostCard/FilterBar/PostModal/StatsBar` | 날짜/소스/섹터/블로그 필터 + 카드(리스크 노출) |

## 3. 데이터 파이프라인 (`scripts/collect-rss.js` 단일 파일)

```
블로그 RSS + 텔레그램(t.me/s/ 스크래핑) 수집 (오늘+어제 2일)
→ Haiku 개별 분석 (headline/summary/stocks/sector/stance/reasoning/risks/numbers)
→ 종목 별칭 정규화 (config/stock-aliases.json)
→ 주가 수집: 7일 내 2명+ 언급 종목(상한 25) — 네이버 자동완성(이름→코드, config/stock-codes.json 캐시)
   + 국내 siseJson / 해외 api.stock.naver.com → d1/d5/d20 등락률
→ 시황 수집: KOSPI/KOSDAQ 지수 + finance.naver.com investorDealTrendDay 수급(개인/외인/기관, 외인5일 누적)
→ Opus 종합 리포트 (여론+주가+시황 전부 주입 → 말vs가격 괴리 분석 포함)
→ public/data/posts.json 저장 { date, daily_briefs[7], market, prices, posts[7일치] }
→ git push → Vercel
```

핵심 구현 디테일 (다음 세션이 알아야 할 것):
- **person 태그**: 같은 사람이 블로그+텔레그램 양쪽에 있음(너쟁이, 잠실개미) → 모든 인원 집계는 `person` 기준 중복 제거
- **parseJSONLoose()**: 모델이 JSON 뒤에 텍스트 붙여도 파싱 (분석실패 0건 유지 장치)
- **브리핑 캐시**: daily_briefs[0].date == 오늘이면 재생성 안 함. 브리핑 재생성 테스트 시 오늘 브리핑을 배열에서 제거 후 실행
- 시세/시황 실패해도 여론 파이프라인은 무손상 (try/catch 분리)

## 4. 판정 시스템 (구현 완료 ✅ — 2026-07-14 커밋 85954fc, 5441f4f)

- `scripts/judge.js`: 스펙(judge_verdict + critic) 순수 JS 구현 — AI 호출 없음, 결정적, 비용 0
- 파이프라인 연동: collect-rss.js → judgeBatch() → posts.json에 `verdicts` + `verdict_history`(5회, critic C2용) 저장
- UI: `AttentionTrends.jsx`에서 ILLUSION=True 종목에 🔀괴리 표시 (판정 배지는 안 B 채택으로 제거 — 매매추천 오해 방지)
- 회귀테스트: judge 골든 7케이스 + critic 골든 6케이스 포함 (총 31케이스, npm test)
- 스펙 원문은 `specs/` 유지 (결정표 변경 시 스펙 → 테스트 → 코드 순으로 수정)

## 5. 로컬 실행 방법

```bash
cd naver-blog-dashboard
# API 키는 .env의 CLAUDE_API_KEY (dotenv 미사용 — 수동 주입 필요)
export CLAUDE_API_KEY="$(grep '^CLAUDE_API_KEY=' .env | cut -d= -f2- | tr -d '\r\"')"
node scripts/collect-rss.js   # 전체 파이프라인 (~3-5분)
npm run build                  # 빌드 확인
```
배포 = git add/commit → `git pull --rebase origin main` → push (Vercel 자동)

## 6. 소스 추가 방법

- 텔레그램: `https://t.me/s/{핸들}` 접속되면 공개=수집가능. `config/telegram-channels.json`에 `{id, name, person}` 추가
- 블로그: `config/blogs.json`에 `{id, name, person}` (RSS: rss.blog.naver.com/{id}.xml 확인)
- **적정선 15~20개 (현재 18)**. 추가 시 기존 소스와 중복도·반대시각·타섹터 여부 검증할 것. 25개 초과 시 브리핑 max_tokens 상향 필요

## 7. 알려진 이슈 / 주의

- git `index.lock` 충돌 잦음 → `del .git\index.lock` 후 재시도 (`unlock_and_commit.bat`)
- Actions 워크플로우는 `posts.json` + `config/stock-codes.json` 두 파일을 커밋함 (stock-codes 누락 시 rebase 실패 — 2026-07-12 수정됨)
- 터미널에서 python 한글 출력 시 cp949 인코딩 깨짐 → 파일로 저장 후 Read로 확인
- 네이버 API들은 비공식 — 구조 변경 시 파싱 수정 필요 (시세: siseJson 정규식, 수급: `class="date2"` 정규식)

## 7-B. 장애 대응 런북 (새벽에 파이프라인이 죽었을 때 — AI에게 묻기 전에)

**1단계: 어디서 죽었나** — github.com/Dremandream/naver-blog-dashboard → Actions → 실패한 run 클릭
| 실패한 스텝 | 원인 후보 | 첫 조치 |
|---|---|---|
| 회귀 테스트 | 파싱 코드가 깨짐 (직전 커밋 의심) | `npm test` 로컬 실행 → 실패 케이스명 확인 → 직전 커밋 diff |
| 수집 및 요약 | ①네이버/텔레그램 구조 변경 ②API 키 만료 ③특정 소스 장애 | 로그에서 `❌`/`실패` 검색. "HTTP 4xx"=구조·차단, "API"=키 확인 |
| 커밋 & 푸시 | rebase 충돌 | 로그 그대로 두고 다음 실행에서 자가 복구되는지 확인 (-X theirs 재시도 있음) |
**2단계: 화면 증상으로 역추적** — UI에 "⚠️ N시간 전 데이터" 배너 = 수집이 안 돈 것. 브리핑 날짜만 옛날 = 브리핑 생성만 실패(로그에서 "브리핑 생성 실패" 검색, 보통 토큰 잘림).
**3단계: 로컬 재현** — §5 로컬 실행 → 같은 에러 나면 코드 문제, 안 나면 Actions 환경(Secrets) 문제.
- 실패 시 텔레그램 자동 알림 있음 (TELEGRAM_BOT_TOKEN/CHAT_ID Secrets 등록 시 활성)

## 7-C. 자격증명 규칙
- `.env`는 gitignore됨(확인 완료), 히스토리 유출 없음(스캔 완료). **키를 채팅/터미널에 출력 금지.**
- 2026-07-11 세션에서 CLAUDE_API_KEY가 로컬 터미널에 1회 출력된 이력 있음. 로테이션 권고했으나 **사용자 결정(2026-07-17): 기존 키 유지** — 로컬 노출 1회뿐이고 git 유출 없음. 더 이상 챙기지 말 것. 단, console.anthropic.com Usage에서 이상 사용량 발견 시 그때 Revoke→재발급(.env + GitHub Secrets 교체).

## 8. 다음 로드맵 (우선순위, 구현 전 필요성 재확인)

1. [x] ~~판정 시스템 구현~~ — 완료 (§4 참조)
2. [x] ~~지난 리포트 열람~~ — 완료 (날짜 칩, 세션 10)
3. [x] ~~촉매 캘린더~~ — 완료 (세션 12): 브리핑 신 스키마에 `events[{date,label,stocks,source,approx}]` 추가(Opus가 날짜 명시된 미래 이벤트만 추출, 최대 6개) → `EventCalendar.jsx`가 7일치 병합·중복제거·오늘 이후만 표시, FactSidebar 하단 "📅 주요 일정" 섹션. 커밋 3b649bd
4. [x] **소스 적중률** — Phase 1·2·3 전부 완료(세션 12). **스펙**: 적중=지수 대비 초과수익(KR=코스피, US=나스닥), 5·20거래일. 파이프라인: `history.json`에 날짜별 종가·지수·의견 누적(`archiveHistory`, fetchClosesDated로 의견 8일 구간 자동 백필) → `hitrate.js`의 `computeSourceScores`가 person별 {hits,total,rate}×{5,20} 계산 → posts.json `source_scores` 저장 → UI `SourceScores.jsx`(AttentionTrends 아래). US 지수는 `fetchForeignIndexClosesDated`(.IXIC 나스닥·.INX S&P500) 신규 수집. Actions가 history.json 커밋. 회귀 38건(HR1~7 포함). **소급 백필 완료(세션 12)**: `scripts/backfill-history.js`가 git 이력의 posts.json 스냅샷(72커밋)에서 과거 의견 복원 + 과거 종가/지수 수집 → history 병합 → 적중률 재계산. **방향성 stance는 07-06부터 존재**(그 전 분석기 미추출). 결과: 콤디티 40%(2/5)·의교창 20%(2/10) 등 실제 5일 적중률 표시, 나머지는 표본부족/판정중(5거래일 미경과·표본<5). 20일은 전부 판정중(창 미도래). archiveHistory는 덮어쓰기→병합으로 변경(백필분 보존). 상세 plan.md.
5. [ ] UI: 요약↔전체 토글, 다크모드 (선택)

## 9. 히스토리 요약

**세션 9~10 전반**: 텔레그램 8채널 통합 → 종합의견을 Opus 증권사 리포트 형식으로(강세/약세/소수의견/관전포인트) → person 중복제거·종목 정규화·JSON파서 등 신뢰도 → UI 리포트 톤 정리 + 중복 패널 통합(스파이크/주간트렌드/핵심종목→관심추이 1개) → **Phase 1: 주가 병기(말vs가격)** → **Phase 2: 시황 레이어(지수+수급)** → 판정 시스템 스펙 작성. 문서: PRD.md(SSOT), specs/, 구버전 cowork-prompt.md는 ../archive/로.

**세션 10 후반 (2026-07-13~14)**:
- 지난 리포트 열람(날짜 칩) · 쏠림 경고 + 소외된 시각(다양성 필터, 정보과잉 연구 근거)
- 소스 개수 검증: 18개=적정(역U자 연구), 늘리기보다 "반대시각/타섹터"만 선별 추가 원칙
- **증권사 인쇄물 디자인 시스템**: :root 토큰, Noto Serif KR, 종이 시트, 괘선, 제호 "데일리 투자 리포트" (스크린샷 피드백 반영)
- 07-13 폭락일 실전 대응: 지수 하루 지연 원인 규명 → **평일 16:30 오후 크론 추가**, 지수 기준일(asOf) 표기, 브리핑 잘림(글 23개↑) → **max_tokens 5000+재시도**
- **운영 규율 이식**: 회귀테스트 18케이스(npm test, Actions 게이트), 신선도 26h UI 경고, PROGRESS.md(4문서 체계), Actions 실패 텔레그램 알림, 브리핑 스키마 정규화, 장애 런북, 자격증명 점검(히스토리 유출 無, 키 로테이션 권장)
- judge_verdict 스펙을 오늘 실데이터로 시뮬레이션: 폭락일 buy 0·needs_review 2(착시괴리) — 스펙 타당성 확인 → 이후 정식 구현 완료 (§4)

**세션 11 (2026-07-17)**:
- 프로젝트 폴더 정리: 구버전 handoff/plan/중복 Fable5 폴더 삭제 → handoff는 이 파일 하나만 유지
- 판정 시스템 구현 완료 확인 (커밋 85954fc·5441f4f, 라이브 데이터에 verdicts 9종목 정상 작동, npm test 31/31 통과) → handoff §4·로드맵 현행화
- **종합 리포트 간결화**: 스키마 교체 `{headline, positive[{sector,items[{name,point,mentions}]}], negative[...], minority(≤2)}` — 긍정/부정 2단 × 산업별 그룹 × 종목당 근거 1줄. brief 문단·말vs가격(관심추이와 중복)·관전포인트·쏠림·hot_stocks 제거. 구 스키마 리포트(7일치)는 DailyBrief.jsx에서 기존 레이아웃 폴백 렌더. 텔레그램 알림도 신 스키마로.
- 소스 정리: 혀니루 삭제(6개월 휴면) → 17개. 전 소스 반도체 편중 확인 — 추가는 타섹터만 (커밋 2f09064 이전)
- **증권사 리포트 디자인 이식** (D:\산업스터디 PDF들 — NH·메리츠·삼성·DAOL 구조 학습): ①크림슨 아이덴티티 밴드+Daily Note 라벨 ②`FactSidebar.jsx` 신설 — 본문(주장) 좌 2/3 + 시황·역행감지(데이터) 우 1/3, MarketStrip 대체(파일은 남아있으나 미사용) ③소수의견 → headline 아래 Summary 음영박스 ④모바일 `.main min-width:0` + 관심추이 자체 스크롤. 라이브 확인 완료. 커밋 2f09064
- 참고: 디자인 기준 PDF는 D:\산업스터디\ 아래 (design/ 폴더 복사는 사용자 미결정)

**세션 12 (2026-07-17)**:
- **촉매 캘린더 구현** (로드맵 3번, 커밋 3b649bd): 원안 "watch_points 활용"은 불가(신 스키마에서 제거됨 + 구 데이터도 날짜 없는 자유문장) → 브리핑 스키마에 `events` 필드 신설. 프롬프트 규칙 10번: 날짜 특정 가능한 미래 이벤트만, "7월 말"→말일+approx:true, 최대 6개. 정규화(YYYY-MM-DD 검증) 포함. UI: `EventCalendar.jsx`(mergeEvents 내보냄) → FactSidebar 하단. 이벤트 0건이면 섹션 숨김. npm test 31/31, 라이브 확인 완료(7/31 빅테크 실적 이벤트 표시).
- 주의: events는 7/17 이후 브리핑에만 존재 — 축적되면서 캘린더가 채워지는 구조.
