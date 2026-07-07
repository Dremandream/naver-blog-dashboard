@echo off
if exist .git\index.lock del /f .git\index.lock
if exist .git\HEAD.lock del /f .git\HEAD.lock
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
git commit -m "update: weekly trend + misc changes"
git push
echo.
echo === Done ===
pause
