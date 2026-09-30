$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

$safeVerificationScripts = @(
    "scripts/verify-current-organization.mjs",
    "scripts/verify-finding-reviews.mjs",
    "scripts/verify-findings-operations.mjs",
    "scripts/verify-import-history.mjs",
    "scripts/verify-excel-import.mjs",
    "scripts/verify-import-exclusion.mjs",
    "scripts/verify-manager-summary.mjs",
    "scripts/verify-pilot-reliability.mjs",
    "scripts/verify-pilot-ux.mjs",
    "scripts/verify-pilot-deployment.mjs",
    "scripts/verify-request-boundaries.mjs",
    "scripts/verify-pilot-operations.mjs"
)

Write-Host "=== Safe focused verification ==="
foreach ($scriptPath in $safeVerificationScripts) {
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "Focused verification script is missing: $scriptPath"
    }

    Write-Host "Running $scriptPath"
    & node $scriptPath
    if ($LASTEXITCODE -ne 0) {
        throw "Focused verification failed: $scriptPath"
    }
}

Write-Host "=== Safe focused verification passed ==="
