@echo off
rem Fleet Hub for Windows: unpacks the site next to your other programs and starts it.
rem Double-click this file. No admin rights needed. Installing again keeps all your data.
setlocal
title Fleet Hub install
set "SETUP=%LOCALAPPDATA%\FleetHub-setup"
echo.
echo   Unpacking Fleet Hub (about a minute)...
if exist "%SETUP%" rmdir /s /q "%SETUP%"
mkdir "%SETUP%"
if exist "%SystemRoot%\System32\tar.exe" (
  "%SystemRoot%\System32\tar.exe" -x -f "%~dp0fleethub-files.zip" -C "%SETUP%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%~dp0fleethub-files.zip' -DestinationPath '%SETUP%' -Force"
)
if errorlevel 1 (
  echo.
  echo   Could not unpack fleethub-files.zip. Extract the whole download first, then run this again.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%SETUP%\FleetHub\tools\install.ps1" %*
set "RESULT=%ERRORLEVEL%"
rmdir /s /q "%SETUP%" 2>nul
echo.
pause
exit /b %RESULT%
