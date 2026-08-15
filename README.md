# 네이버 블로그 투자 리서치 대시보드 — GitHub 버전

투자 블로그와 공개 텔레그램 글을 자동으로 수집하고 Claude로 분석해, 종합 시황과 읽을 가치가 높은 원문을 선별하는 개인 투자 리서치 대시보드입니다.

- 라이브: https://naver-blog-dashboard.vercel.app
- 사용자 초점: 삼성전자·SK하이닉스, 반도체 시황, 새로운 투자 아이디어
- 자동 실행: 매일 KST 08:00 + 평일 KST 16:30
- 운영 구조: GitHub Actions → JSON 데이터 커밋 → Vercel 자동 배포

## 첫 화면

1. 오늘의 종합판단 + Peter K Fear & Greed
2. 오늘 꼭 읽을 독특한 글
3. 관심 종목·시장 객관 데이터
4. 소스 실험 통계
5. 접힌 상세 시황·반대 의견·반도체 펄스

이 서비스는 매수·매도 추천기가 아니라 **읽을 원문을 고르는 개인 리서치 비서**입니다.

## 로컬 실행

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run dev
```

프로덕션 빌드:

```powershell
npm.cmd run build
```

로컬 수집은 환경변수 `CLAUDE_API_KEY`가 설정된 경우에만 실행합니다.

```powershell
npm.cmd run collect
```

API 키·토큰은 `.env` 또는 GitHub Secrets로만 관리하며 저장소에 커밋하지 않습니다.

소스 적중률의 최근 2년 원문 수량은 AI 비용 없이 감사할 수 있습니다.

```powershell
npm.cmd run backfill:sources:audit
```

실제 2년 재분석은 GitHub Actions의 `소스 적중률 2년 정식 백필`을 수동 실행합니다. 이후 공식 의견 종목과 지수는 매주 일요일 KST 03:00에 AI 호출 없이 자동 갱신됩니다.

## 주요 경로

| 경로 | 설명 |
|---|---|
| `config/` | 블로그·텔레그램·종목 설정 |
| `scripts/collect-rss.js` | 수집과 AI 분석 진입점 |
| `scripts/lib/` | 파서·시장 데이터·분석 모듈 |
| `shared/` | 프론트와 수집기가 함께 쓰는 순수 로직 |
| `src/` | React 대시보드 |
| `tests/regression.mjs` | 회귀 테스트 |
| `public/data/` | 배포 데이터와 장기 이력 |

## 작업 시작 전 읽을 문서

1. `CLAUDE.md` — 운영 원칙과 저장소 경계
2. `PROGRESS.md` — 현재 상태와 다음 작업
3. `PRD.md` — 제품 목적과 비목표
4. `plan.md` — 구현 단계와 결정 기록
5. `handoff.md` — 상세 세션 이력과 장애 대응

별도 `n8nversion` 실험은 이 저장소의 범위가 아닙니다. 현재 저장소는 운영 중인 GitHub Actions·Vercel 안정 버전으로 유지합니다.
