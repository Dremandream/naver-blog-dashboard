@echo off
if exist .git\index.lock del /f .git\index.lock
echo === npm run build ===
call npm run build
if errorlevel 1 (
    echo Build failed
    pause
    exit /b 1
)
echo.
echo === git add + commit + push ===
git add -A
git commit -m "DailyBrief: timestamp display + mobile flexWrap, collect-rss caching"
git push
echo.
echo === Done ===
pause
