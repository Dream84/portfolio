@echo off
rem MyPortfolio 双击启动入口：启动后台服务并显示托盘图标
rem 不需要 npm，也不需要自己敲命令；退出请用托盘菜单或「退出 MyPortfolio.cmd」
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0launcher\tray.ps1"
exit /b 0
