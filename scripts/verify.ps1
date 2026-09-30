$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== ServiceAudit Verification ==="
Write-Host ""

Write-Host "1/4 Git branch and status"
git branch --show-current
git status --short

Write-Host ""
Write-Host "2/4 ESLint"
npm run lint
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "3/4 TypeScript"
npx tsc --noEmit
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "4/4 Production build"
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Verification passed ==="
Write-Host ""

git status --short
