@echo off
chcp 65001 > nul
cd /d "C:\Users\simin\Claude\Projects\블로그 글 자동화 프로젝트\naver-blog-dashboard"

echo === npm run build ===
call npm run build
if errorlevel 1 (
    echo.
    echo [오류] 빌드 실패
    pause
    exit /b 1
)

echo.
echo === git add + commit + push ===
git add -A
git commit -m "일별 종합 브리핑 추가: 블로거 간 합의/이견 비교 (daily_brief)"
git push

if errorlevel 1 (
    echo.
    echo [오류] push 실패
    pause
    exit /b 1
)

echo.
echo === 완료! ===
pause
