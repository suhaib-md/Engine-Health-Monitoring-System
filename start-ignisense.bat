@echo off
rem IgniSense - Smart Engine Health Diagnostic (Team Revora)
rem Double-click to run. The first run needs internet once (npm install); after that it runs offline.
title IgniSense - Team Revora
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed, or this window was opened before it was installed.
  echo Install the LTS version from https://nodejs.org ^(20.19 or newer^),
  echo then close this window and double-click this file again.
  echo.
  pause
  exit /b 1
)

rem Check every package the app needs, not just the folder: an interrupted install leaves a
rem half-filled node_modules behind, and a newer download may need a package added since.
set NEED_INSTALL=0
if not exist "node_modules\.bin\tsc.cmd" set NEED_INSTALL=1
if not exist "node_modules\.bin\vite.cmd" set NEED_INSTALL=1
node -e "const p=require('./package.json'),fs=require('fs');const m=Object.keys({...p.dependencies,...p.devDependencies}).filter(d=>!fs.existsSync('node_modules/'+d+'/package.json'));process.exit(m.length?1:0)" || set NEED_INSTALL=1
if "%NEED_INSTALL%"=="1" (
  echo Installing dependencies. This needs internet and takes a minute or two...
  echo Keep this window open until it finishes.
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
