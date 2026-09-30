$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repositoryRoot

function Test-ServiceAuditResponse {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200 -and $response.Content -match "ServiceAudit"
    } catch {
        return $false
    }
}

function Test-Port3000 {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync("127.0.0.1", 3000)
        return $connection.Wait(750) -and $client.Connected
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

Write-Host "=== ServiceAudit development startup ===" -ForegroundColor Cyan
Write-Host "Workspace: $repositoryRoot"

if (-not (Get-Command podman -ErrorAction SilentlyContinue)) {
    throw "Podman is not installed or not available on PATH."
}

podman info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Starting the Podman machine..."
    podman machine start
    if ($LASTEXITCODE -ne 0) { throw "The Podman machine could not be started." }
} else {
    Write-Host "Podman machine is already running."
}

$containerState = (& podman inspect --format "{{.State.Status}}" serviceaudit-postgres 2>$null).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "The serviceaudit-postgres container does not exist. Create it using the documented local setup before retrying."
}
if ($containerState -ne "running") {
    Write-Host "Starting serviceaudit-postgres..."
    podman start serviceaudit-postgres | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "serviceaudit-postgres could not be started." }
} else {
    Write-Host "serviceaudit-postgres is already running."
}

Write-Host "Waiting for PostgreSQL readiness..."
$postgresReady = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    podman exec serviceaudit-postgres pg_isready *> $null
    if ($LASTEXITCODE -eq 0) {
        $postgresReady = $true
        break
    }
    Start-Sleep -Seconds 1
}
if (-not $postgresReady) { throw "PostgreSQL did not become ready within 30 seconds." }
Write-Host "PostgreSQL is ready."

if (Test-ServiceAuditResponse) {
    Write-Host "ServiceAudit is already available at http://localhost:3000."
    exit 0
}
if (Test-Port3000) {
    throw "Port 3000 is occupied, but it does not appear to be serving ServiceAudit. Stop that process before retrying."
}

Write-Host "Starting the Next.js development server..."
$nextDirectory = Join-Path $repositoryRoot ".next"
New-Item -ItemType Directory -Path $nextDirectory -Force | Out-Null
$stdoutPath = Join-Path $nextDirectory "dev-server.stdout.log"
$stderrPath = Join-Path $nextDirectory "dev-server.stderr.log"
$serverProcess = Start-Process npm.cmd -ArgumentList @("run", "dev") -WorkingDirectory $repositoryRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru

for ($attempt = 1; $attempt -le 60; $attempt++) {
    if (Test-ServiceAuditResponse) {
        Write-Host "ServiceAudit is ready at http://localhost:3000."
        Write-Host "Next.js process ID: $($serverProcess.Id)"
        Write-Host "Logs: $stdoutPath and $stderrPath"
        exit 0
    }
    if ($serverProcess.HasExited) {
        throw "The Next.js development server exited early. Review $stderrPath."
    }
    Start-Sleep -Seconds 1
}

throw "ServiceAudit did not become ready within 60 seconds. Review $stdoutPath and $stderrPath."
