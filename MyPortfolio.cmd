@echo off
rem MyPortfolio launcher entry point - double click to start (tray icon, no console window).
rem No npm required. To exit: tray menu "Exit MyPortfolio" or run the stop script.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launcher\tray.ps1"
exit /b 0
