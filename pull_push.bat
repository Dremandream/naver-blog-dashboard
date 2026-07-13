@echo off
echo === git pull --rebase (merge remote changes) ===
git pull --rebase origin main
if errorlevel 1 (
    echo Pull failed!
    pause
    exit /b 1
)

echo.
echo === git push ===
git push
if errorlevel 1 (
    echo Push failed!
    pause
    exit /b 1
)

echo.
echo === SUCCESS - check GitHub! ===
pause
