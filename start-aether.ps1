#!/usr/bin/env pwsh
# One-click launcher for the Aether Repair Tool.
# Starts the FastAPI backend on :8001 and the React dashboard on :3000.
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BACKEND = Join-Path $ROOT "backend"
$FRONTEND = Join-Path $ROOT "frontend"

Write-Host "=== Aether Repair Tool — one-click launcher ===" -ForegroundColor Cyan

# ── Backend .env ──
$ENV_FILE = Join-Path $BACKEND ".env"
if (-not (Test-Path $ENV_FILE)) {
    Write-Host "Creating backend/.env (fill in secrets before first use)" -ForegroundColor Yellow
    @"
MONGO_URL="mongodb://localhost:27017"
DB_NAME="aether"
JWT_SECRET="$( [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32) | ForEach-Object { $_.ToString("x2") } -join '' )"
CORS_ORIGINS="http://localhost:3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="change_me"
BRAIDEN_EMAIL="you@example.com"
BRAIDEN_PASSWORD="change_me"
STRIPE_API_KEY=""
"@ | Set-Content $ENV_FILE -Encoding UTF8
}

# ── Python venv ──
$VENV = Join-Path $BACKEND ".venv"
if (-not (Test-Path (Join-Path $VENV "Scripts" "python.exe"))) {
    Write-Host "Creating Python venv ..." -ForegroundColor Yellow
    python3 -m venv $VENV
}
$PIP = Join-Path $VENV "Scripts" "pip.exe"
$PY = Join-Path $VENV "Scripts" "python.exe"
& $PIP install -q -r (Join-Path $BACKEND "requirements.txt")

# ── Backend .env check ──
$env = Get-Content $ENV_FILE -Raw
if ($env -match 'JWT_SECRET="<random|change_me|your admin|you@example') {
    Write-Host "WARNING: edit backend/.env with real values before relying on auth/payments." -ForegroundColor Yellow
}

# ── Start backend ──
Write-Host "Starting backend on http://localhost:8001 ..." -ForegroundColor Green
$backendProc = Start-Process -FilePath (Join-Path $VENV "Scripts" "uvicorn.exe") `
    -ArgumentList "server:app --host 0.0.0.0 --port 8001" `
    -WorkingDirectory $BACKEND `
    -PassThru -WindowStyle Hidden

# ── Wait for backend to be reachable ──
Write-Host "Waiting for backend to come up ..." -ForegroundColor Cyan
for ($i = 0; $i -lt 60; $i++) {
    try {
        $r = Invoke-RestMethod -Uri "http://localhost:8001/api/" -TimeoutSec 2 -ErrorAction Stop
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
    if ($i -eq 59) {
        Write-Host "Backend did not become reachable. Check uvicorn output." -ForegroundColor Red
    }
}

# ── Frontend ──
$ENV_FILE_FE = Join-Path $FRONTEND ".env"
if (-not (Test-Path $ENV_FILE_FE)) {
    "REACT_APP_BACKEND_URL=http://localhost:8001" | Set-Content $ENV_FILE_FE -Encoding UTF8
}

Write-Host "Installing frontend dependencies ..." -ForegroundColor Yellow
& yarn --cwd $FRONTEND install --frozen-lockfile 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "frozen-lockfile install failed, retrying plain install ..." -ForegroundColor Yellow
    & yarn --cwd $FRONTEND install
}

Write-Host "Starting frontend on http://localhost:3000 ..." -ForegroundColor Green
$frontendProc = Start-Process -FilePath "yarn.cmd" `
    -ArgumentList "start" `
    -WorkingDirectory $FRONTEND `
    -PassThru -WindowStyle Hidden

Write-Host "=== Aether is running ===" -ForegroundColor Green
Write-Host "  Backend : http://localhost:8001"
Write-Host "  Frontend: http://localhost:3000"
Write-Host ""
Write-Host "Press Ctrl+C to stop both services."

function Cleanup {
    Write-Host "`nStopping services ..." -ForegroundColor Yellow
    if ($backendProc)  { Stop-Process -Id $backendProc.Id  -Force -ErrorAction SilentlyContinue }
    if ($frontendProc) { Stop-Process -Id $frontendProc.Id -Force -ErrorAction SilentlyContinue }
}
trap { Cleanup; exit 1 }

# Keep this console alive until the user presses Ctrl+C
while ($true) {
    Start-Sleep -Seconds 5
    if ($backendProc.HasExited -or $frontendProc.HasExited) {
        Write-Host "A service exited. Press Ctrl+C to fully stop." -ForegroundColor Red
        break
    }
}
