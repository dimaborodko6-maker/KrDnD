@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org/en/download and try again.
  pause
  exit /b 1
)
if not exist "node_modules\express\package.json" (
  echo Installing locked dependencies. Internet access is required for this first step.
  call npm.cmd ci --ignore-scripts
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
echo Open http://localhost:3000 after the server starts. Keep this window open.
call npm.cmd start
if errorlevel 1 pause
