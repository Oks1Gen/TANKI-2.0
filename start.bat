@echo off
setlocal
title TANKI 2.0 - zapusk
cd /d "%~dp0"

echo Proverka Node.js...
where node >nul 2>nul
if errorlevel 1 (
  echo [OSHIBKA] Node.js ne nayden!
  echo Skachay i ustanovu LTS versiyu s https://nodejs.org/
  pause
  exit /b 1
)
node -v
node -e "var m=process.versions.node.split('.')[0]; if (Number(m) < 18) { console.error('[OSHIBKA] Nuzhen Node.js 18+ (Vite 7), seychas ' + process.version); process.exit(1); }"
if errorlevel 1 (
  echo Obnovi Node.js LTS s https://nodejs.org/
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [OSHIBKA] npm ne nayden! Pereustanovi Node.js s https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo.
  echo Ustanovka zavisimostey: npm install. Eto mozhet zanyat paru minut...
  call npm.cmd install
  if errorlevel 1 (
    echo [OSHIBKA] Ne udalos ustanovit zavisimosti.
    pause
    exit /b 1
  )
) else (
  echo Zavisimosti na meste, propuskaem npm install.
)

echo.
echo Zapusk lokalnogo servera...
echo Stranitsa http://localhost:5173/ otkroetsya v browsere avtomaticheski
echo (esli port zanyat, Vite vyberet sleduyushchiy i pokazhet ego v loge).
echo Dlya ostanovki nazhmi Ctrl+C v etom okne.
echo.

call npm.cmd run dev -- --port 5173 --open

echo.
echo Server ostanovlen.
pause
