@echo off
echo === git lock/index 정리 ===
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock del /f .git\HEAD.lock
if exist .git\index del /f .git\index
git reset HEAD --quiet 2>nul
echo.
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
git commit -m "refactor: Fable improvements - KST fix, HTML telegram, blogger count, stock aliases"
git push
echo.
echo === Done ===
pause
