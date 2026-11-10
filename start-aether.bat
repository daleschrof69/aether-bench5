@echo off
:: One-click launcher for the Aether Repair Tool (Windows batch)
:: Starts the FastAPI backend on :8001 and the React dashboard on :3000.
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo === Aether Repair Tool - one-click launcher ===

:: Create backend .env if missing
if not exist "%BACKEND%\.env" (
    echo Creating backend\.env ...
    echo MONGO_URL="mongodb://localhost:27017" > "%BACKEND%\.env"
    echo DB_NAME="aether" >> "%BACKEND%\.env"
    echo JWT_SECRET="change_me" >> "%BACKEND%\.env"
    echo CORS_ORIGINS="http://localhost:3000" >> "%BACKEND%\.env"
    echo ADMIN_EMAIL="admin@example.com" >> "%BACKEND%\.env"
    echo ADMIN_PASSWORD="change_me" >> "%BACKEND%\.env"
    echo BRAIDEN_EMAIL="you@example.com" >> "%BACKEND%\.env"
    echo BRAIDEN_PASSWORD="change_me" >> "%BACKEND%\.env"
    echo STRIPE_API_KEY="" >> "%BACKEND%\.env"
)

:: Create venv if missing
if not exist "%BACKEND%\.venv\Scripts\python.exe" (
    echo Creating Python venv ...
    python3 -m venv "%BACKEND%\.venv"
)

:: Install backend deps
call "%BACKEND%\.venv\Scripts\pip.exe" install -q -r "%BACKEND%\requirements.txt"

:: Create frontend .env if missing
if not exist "%FRONTEND%\.env" (
    echo REACT_APP_BACKEND_URL=http://localhost:8001 > "%FRONTEND%\.env"
)

:: Start backend in a new hidden window
echo Starting backend on http://localhost:8001 ...
start "Aether Backend" /b "%BACKEND%\.venv\Scripts\uvicorn.exe" server:app --host 0.0.0.0 --port 8001

:: Wait for backend
echo Waiting for backend ...
for /L %%i in (1,1,60) do (
    powershell -Command "try { Invoke-RestMethod -Uri 'http://localhost:8001/api/' -TimeoutSec 2 } catch {}" >nul 2>&1
    if !errorlevel! equ 0 goto :backend_up
    timeout /t 1 >nul
)
echo Backend did not start in time.
goto :done

:backend_up
echo Backend is up.

:: Install frontend deps
echo Installing frontend dependencies ...
cd /d "%FRONTEND%"
yarn install >nul 2>&1

:: Start frontend
echo Starting frontend on http://localhost:3000 ...
start "Aether Frontend" /b yarn start

echo === Aether is running ===
echo   Backend : http://localhost:8001
echo   Frontend: http://localhost:3000
echo.
echo Close both console windows to stop.

:done
cmd /k
