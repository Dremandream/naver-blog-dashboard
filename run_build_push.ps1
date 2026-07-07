Set-Location $PSScriptRoot

# 1. index.lock 제거
$lock = Join-Path $PSScriptRoot '.git\index.lock'
if (Test-Path $lock) {
    Remove-Item $lock -Force
    Write-Host 'index.lock 제거 완료'
}
$headlock = Join-Path $PSScriptRoot '.git\HEAD.lock'
if (Test-Path $headlock) {
    Remove-Item $headlock -Force
    Write-Host 'HEAD.lock 제거 완료'
}

# 2. collect-rss.js를 HEAD 버전으로 복원
Write-Host '=== collect-rss.js HEAD 버전으로 복원 ==='
git checkout HEAD -- scripts/collect-rss.js
if ($LASTEXITCODE -ne 0) { Write-Host 'checkout 실패'; Read-Host; exit 1 }

# 3. git pull --rebase
Write-Host '=== git pull --rebase ==='
git pull --rebase origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host 'pull --rebase 실패. conflict 해결 필요'
    Read-Host
    exit 1
}

# 4. git push
Write-Host '=== git push ==='
git push origin main
if ($LASTEXITCODE -ne 0) { Write-Host 'push 실패'; Read-Host; exit 1 }

Write-Host ''
Write-Host '=== push 완료! ==='
git log --oneline -3
Read-Host 'Enter를 누르면 닫힙니다'
