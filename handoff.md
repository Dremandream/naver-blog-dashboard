# Handoff — 네이버 블로그·텔레그램 투자 리서치 대시보드

## 마지막 업데이트
2026-07-12 (세션 9~10, Claude Code CLI / Opus)

> ⚠️ 이 문서는 다음 세션(더 작은 모델 포함)이 그대로 이어받을 수 있게 작성됨.
> 규칙: **CLAUDE.md 필독** → 기능 만들기 전 필요성 확인 / 검증→구조→구현 / 완료=라이브 확인.

---

## 1. 현재 상태: 전체 완성, 라이브 운영 중 ✅

- **URL**: https://naver-blog-dashboard.vercel.app
- **자동화**: GitHub Actions 매일 KST 08:00 (`.github/workflows/collect.yml`) → 수집→분석→push→Vercel 자동배포
- **소스 18개**: 블로그 10 (`config/blogs.json`) + 텔레그램 8 (`config/telegram-channels.json`)
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

## 4. 판정 시스템 스펙 (문서만, 미구현)

- `specs/judge_verdict.md`: 시그널→buy/watch/pass/needs_review + confidence(0.10~0.50, step 0.10) 완전 결정표. 착시(여론방향 vs 5일가격방향 역행)=True → needs_review 강제
- `specs/critic.md`: 발송 전 2차 심사 5항목 결정표 + 출력 스키마
- **구현 전 사용자 승인 필요** (CLAUDE.md: 매수/매도 추천 금지 원칙과의 경계선 논의 완료 — "규칙 기반+기권 있는 판정"으로 허용 합의)

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

## 8. 다음 로드맵 (우선순위, 구현 전 필요성 재확인)

1. [ ] **판정 시스템 구현** — specs 승인 후 (judge_verdict + critic)
2. [ ] **지난 리포트 열람** — daily_briefs 7일치 이미 저장됨, UI만 (소형)
3. [ ] **촉매 캘린더** — watch_points를 날짜순 이벤트로 (소형)
4. [ ] **소스 적중률** — 강세 외친 종목의 실제 5일 수익률 → 소스별 신뢰점수 (prices 데이터 축적 필요, 대형)
5. [ ] UI: 요약↔전체 토글, 다크모드 (선택)

## 9. 히스토리 요약 (세션 9~10에서 한 일)

텔레그램 8채널 통합 → 종합의견을 Opus 증권사 리포트 형식으로(강세/약세/소수의견/관전포인트) → person 중복제거·종목 정규화·JSON파서 등 신뢰도 → UI 리포트 톤 정리 + 중복 패널 통합(스파이크/주간트렌드/핵심종목→관심추이 1개) → **Phase 1: 주가 병기(말vs가격)** → **Phase 2: 시황 레이어(지수+수급)** → 판정 시스템 스펙 작성. 문서: PRD.md(SSOT), specs/, 구버전 cowork-prompt.md는 ../archive/로.
