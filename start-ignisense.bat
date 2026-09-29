@echo off
rem IgniSense - Smart Engine Health Diagnostic (Team Revora)
rem Double-click to run. The first run needs internet once (npm install); after that it runs offline.
title IgniSense - Team Revora
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install the LTS version from https://nodejs.org ^(20.19 or newer^), then double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo First run: installing dependencies. This needs internet once and takes a minute or two...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. Check the internet connection and try again.
    pause
    exit /b 1
  )
)

echo Building IgniSense...
call npm run build
if errorlevel 1 (
  echo.
  echo The build failed. See the messages above.
  pause
  exit /b 1
)

echo.
echo IgniSense is running at http://localhost:4173
echo Your browser should open by itself. Close this window to stop IgniSense.
echo.
call npx vite preview --port 4173 --strictPort --open
pause
