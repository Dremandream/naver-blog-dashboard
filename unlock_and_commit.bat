@echo off
echo === Kill ALL lock files (recursive, including hidden/system) ===
for /r ".git" %%f in (*.lock) do (
    echo Deleting: %%f
    del /f /q /a "%%f" 2>nul
)
echo Done removing lock files.

echo.
echo === Recreate clean index from HEAD ===
git read-tree HEAD
if errorlevel 1 (
    echo read-tree FAILED
    pause
    exit /b 1
)

echo.
echo === git add ===
git add .github/workflows/collect.yml config/stock-aliases.json scripts/collect-rss.js src/App.jsx src/App.css src/components/SpikeAlert.jsx src/components/WeeklyTrend.jsx handoff.md fix_and_push.bat push_now.bat
if errorlevel 1 (
    echo git add FAILED
    pause
    exit /b 1
)

echo.
echo === git commit ===
git commit -m "refactor: Fable improvements - KST fix, HTML telegram, blogger count, stock aliases"
if errorlevel 1 (
    echo Commit FAILED
    pause
    exit /b 1
)

echo.
echo === git push ===
git push
if errorlevel 1 (
    echo Push FAILED
    pause
    exit /b 1
)
echo.
echo === SUCCESS! Check GitHub for new commit ===
pause
