@echo off
setlocal enabledelayedexpansion
title Aether Lab - CLI Bridge
set URL=http://127.0.0.1:4747

curl -fsS %URL%/health >nul 2>&1
if not errorlevel 1 (
  echo [aether] bridge already running on %URL%
  timeout /t 3 >nul
  exit /b 0
)

where node >nul 2>&1
if errorlevel 1 (
  echo [aether] Node.js 18+ is required - install from https://nodejs.org
  pause
  exit /b 1
)

set "DIR="
for %%D in ("%AETHER_BRIDGE_DIR%" "%CD%\bridge" "%USERPROFILE%\aether-lab\bridge" "%USERPROFILE%\Desktop\aether-lab\bridge" "%USERPROFILE%\Downloads\aether-lab\bridge" "%USERPROFILE%\Documents\aether-lab\bridge") do (
  if exist "%%~D\daemon.js" if not defined DIR set "DIR=%%~D"
)
if not defined DIR set /p DIR=Path to your bridge folder (contains daemon.js): 
if not exist "%DIR%\daemon.js" (
  echo [aether] no daemon.js in "%DIR%"
  pause
  exit /b 1
)
cd /d "%DIR%"
if not exist config.json copy config.example.json config.json >nul
echo [aether] starting bridge from %DIR%
echo [aether] keep this window open - the app connects automatically
node daemon.js
pause
