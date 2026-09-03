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
echo Stranitsa http://localhost:5173/ otkroetsya v browsere avtomaticheski,
echo kak tolko server budet gotov.
echo Dlya ostanovki nazhmi Ctrl+C v etom okne.
echo.

call npm.cmd run dev -- --port 5173 --strictPort --open

echo.
echo Server ostanovlen.
pause
