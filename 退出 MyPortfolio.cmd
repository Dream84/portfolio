@echo off
rem Stop MyPortfolio (kills the launcher process tree via .myportfolio.pid).
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launcher\stop.ps1"
exit /b 0
