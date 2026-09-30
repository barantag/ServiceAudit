$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot
$currentStage = "initialization"

function Invoke-QaStage {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Action
    )

    $script:currentStage = $Name
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed with exit code $LASTEXITCODE."
    }
    Write-Host "PASS: $Name" -ForegroundColor Green
}

try {
    Invoke-QaStage "Project and branch context" {
        $gitRoot = (& git rev-parse --show-toplevel).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($gitRoot)) {
            throw "The workspace is not a Git repository."
        }
        if ((Resolve-Path -LiteralPath $gitRoot).Path -ne (Resolve-Path -LiteralPath $repositoryRoot).Path) {
            throw "QA must run from the ServiceAudit repository."
        }

        $branch = (& git branch --show-current).Trim()
        if ([string]::IsNullOrWhiteSpace($branch)) {
            throw "QA requires a named Git branch."
        }
        Write-Host "Repository: $gitRoot"
        Write-Host "Branch: $branch"
        git status --short
    }

    Invoke-QaStage "Stale Playwright artifact cleanup" {
        $generatedArtifactDirectories = @(
            "playwright-report",
            "test-results",
            "blob-report"
        )
        $resolvedRepositoryRoot = (Resolve-Path -LiteralPath $repositoryRoot).Path.TrimEnd("\")

        foreach ($directoryName in $generatedArtifactDirectories) {
            $targetPath = [System.IO.Path]::GetFullPath((Join-Path $resolvedRepositoryRoot $directoryName))
            $expectedParent = [System.IO.Directory]::GetParent($targetPath).FullName.TrimEnd("\")
            if ($expectedParent -ne $resolvedRepositoryRoot) {
                throw "Refusing to remove an artifact path outside the repository root: $targetPath"
            }

            if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
                throw "Expected a generated artifact directory but found a file: $targetPath"
            }
            if (Test-Path -LiteralPath $targetPath -PathType Container) {
                Write-Host "Removing stale generated artifacts: $directoryName"
                Remove-Item -LiteralPath $targetPath -Recurse -Force
            }
        }
    }

    Invoke-QaStage "Playwright Chromium preflight" {
        node "$PSScriptRoot\check-playwright-browser.mjs"
    }

    Invoke-QaStage "PostgreSQL and container availability" {
        if (-not (Get-Command podman -ErrorAction SilentlyContinue)) {
            throw "Podman is not installed or not available on PATH. Run .\scripts\dev-start.ps1 after installing Podman."
        }

        podman info --format "Podman {{.Version.Version}}"
        $containerState = (& podman inspect --format "{{.State.Status}}" serviceaudit-postgres 2>$null).Trim()
        if ($LASTEXITCODE -ne 0 -or $containerState -ne "running") {
            throw "serviceaudit-postgres is not running. Run .\scripts\dev-start.ps1 first."
        }

        podman exec serviceaudit-postgres pg_isready
    }

    Invoke-QaStage "Safe focused verification" {
        & "$PSScriptRoot\verify-focused.ps1"
    }

    Invoke-QaStage "Code-level verification" {
        powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\verify.ps1"
    }

    Invoke-QaStage "Playwright browser verification" {
        npm run test:e2e
    }

    Invoke-QaStage "Git whitespace verification" {
        git diff --check
    }

    Write-Host ""
    Write-Host "=== SERVICEAUDIT QA PASS ===" -ForegroundColor Green
    Write-Host "No commit was created. Review the evidence and Git diff before committing."
    git status --short
} catch {
    Write-Host ""
    Write-Host "=== SERVICEAUDIT QA FAIL ===" -ForegroundColor Red
    Write-Host "Failed stage: $currentStage" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($currentStage -eq "Playwright browser verification") {
        Write-Host "Failure screenshots and traces are retained under test-results/."
        Write-Host "The HTML report is available under playwright-report/."
    }
    exit 1
}
