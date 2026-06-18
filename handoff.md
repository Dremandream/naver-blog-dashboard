# Handoff - 네이버 블로그 투자 대시보드

## 마지막 업데이트
2026-06-17 (세션 2)

---

## 현재 상태: 전체 파이프라인 정상 작동 중 ✅

### 세션 2에서 완료된 것
- [x] 블로그 7개 추가 (3개 → 10개): luy1978, sunstudy-, superclickman, chcmg2022, tenbagger10x, 68083015, itsthend
- [x] AI 프롬프트 개선 — sector 11개로 확장 (자동차·로봇, 방산, 부동산, 소재·화학, 거시경제 추가)
- [x] signal_reason 필드 추가 — 매수/매도 판단 근거 명시 (불분명하면 강제 중립)
- [x] max_tokens 512 → 800 으로 확장
- [x] GitHub Actions #12 성공 (1m 38s), 20개 글 수집 확인
- [x] Vercel 대시보드에서 새 섹터 (자동차·로봇, 거시경제) 표시 확인
- [x] PostCard.jsx — signal_reason UI 표시 코드 추가 (미푸시)
- [x] App.css — .signal-reason 스타일 추가 (미푸시)

### 미완료: 다음 세션에서 해야 할 것
- [ ] **signal_reason UI 변경사항 git push 필요** (lock 파일 문제로 중단)
  - 변경된 파일: `src/components/PostCard.jsx`, `src/App.css`
  - Claude Code 탭에서 아래 명령 실행:
    ```
    cd "C:\Users\simin\Claude\Projects\블로그 글 자동화 프로젝트\naver-blog-dashboard"
    del .git\index.lock
    git add src/components/PostCard.jsx src/App.css
    git commit -m "feat: signal_reason 카드 UI에 표시"
    git push
    ```

### 현재 동작 확인된 것
- 대시보드 URL: https://naver-blog-dashboard.vercel.app
- 최근 수집: 2026-06-17 기준 20개 글 (10개 블로그)
- signal_reason 데이터는 posts.json에 있음 (UI 미표시 상태)

---

## 다음 세션 시작 방법

1. 이 파일 첨부
2. "signal_reason push부터 이어서 해줘" 입력
3. Claude Code 탭에서 위 git 명령 실행 후 Vercel 확인

---

## 핵심 파일 위치
```
naver-blog-dashboard/
├── CLAUDE.md                    # 프로젝트 원칙 (필독)
├── plan.md                      # 단계별 계획 (개선 항목 포함)
├── handoff.md                   # 이 파일
├── config/blogs.json            # 이웃 블로그 목록 (10개)
├── scripts/collect-rss.js       # RSS 수집 + Claude AI 요약 메인 스크립트
├── public/data/posts.json       # 수집 데이터 (Actions가 자동 업데이트)
├── src/components/PostCard.jsx  # 카드 UI (signal_reason 추가됨, 미푸시)
├── src/App.css                  # 스타일 (signal-reason 스타일 추가됨, 미푸시)
├── template/                    # 반복 작업 템플릿
└── .github/workflows/collect.yml # GitHub Actions (매일 KST 08:00)
```

---

## 핵심 교훈 (잊지 말 것)
- Playwright → Naver 봇 차단으로 실패. 다시 쓰지 말 것
- RSS는 인증 없이 작동. 이 방식 유지
- .git/index.lock 오류 → sandbox 권한 없음 → Claude Code 탭에서 수동 삭제
- 개선 전 반드시 plan.md 작성 먼저
- "완료"를 말로 두지 말고 Vercel 대시보드에서 직접 눈으로 확인
