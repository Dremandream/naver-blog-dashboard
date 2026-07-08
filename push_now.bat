@echo off
echo === Removing lock files ===
if exist .git\index.lock del /f .git\index.lock 2>nul
if exist .git\HEAD.lock del /f .git\HEAD.lock 2>nul
if exist .git\packed-refs.lock del /f .git\packed-refs.lock 2>nul
if exist .git\index del /f .git\index 2>nul

echo === git read-tree HEAD ===
git read-tree HEAD
if errorlevel 1 (
    echo read-tree failed!
    pause
    exit /b 1
)

echo === git add -A ===
git add -A
if errorlevel 1 (
    echo git add failed!
    pause
    exit /b 1
)

echo === git commit ===
git commit -m "refactor: Fable improvements - KST fix, HTML telegram, blogger count, stock aliases"

echo === git push ===
git push

echo.
echo === DONE ===
pause
