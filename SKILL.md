# SKILL.md — 네이버 블로그 대시보드 반복 작업 가이드

> 자주 하는 작업의 순서와 주의사항. 작업할 때마다 새 내용을 추가한다.

---

## SKILL 1: 새 블로그 추가
1. config/blogs.json에 추가: `{ "id": "블로그ID", "name": "닉네임" }`
2. RSS 실제 확인: `https://rss.blog.naver.com/{blogId}.xml`
3. git push → GitHub Actions Run workflow → 대시보드 확인

## SKILL 2: AI 프롬프트 개선
- 파일: `scripts/collect-rss.js` → `analyzePost()` 함수 내 prompt 변수
- 수정 후 확인 기준: sector 분류가 맞는지, summary가 구체적인지
- 주의: signal 같은 기능은 구현 전에 실제 필요성 먼저 확인

## SKILL 3: 배포 사이클
```
파일 수정 (Cowork) → git add/commit/push (Claude Code) → Vercel 자동 배포 (~2분) → 브라우저 확인
```
- 충돌 발생 시: `del .git\index.lock` 후 재시도
- push 후 반드시 Vercel에서 파일 내용 변경 확인

## SKILL 4: 워크플로우 수동 실행
- GitHub → 레포 → Actions → collect → Run workflow
- 완료 확인: 대시보드 수집일 날짜 변경 여부

## SKILL 5: 데이터 현황 확인 (PowerShell)
```powershell
cd "C:\Users\simin\Claude\Projects\블로그 글 자동화 프로젝트\naver-blog-dashboard"
Select-String '"date"' public\data\posts.json | Group-Object { $_.Line.Trim() } | Sort-Object Name
```

---

## 추가 예정
- 카카오/이메일 알림 설정
- 모바일 UI 최적화
- 블로그 추가 시 RSS 검증 자동화
