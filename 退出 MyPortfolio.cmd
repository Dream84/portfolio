@echo off
rem 退出 MyPortfolio：读取 PID 文件并结束启动器及其接口子进程
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root='%~dp0'; $pidFile = Join-Path $root '.myportfolio.pid'; if (Test-Path $pidFile) { $p = [int](Get-Content $pidFile); Write-Host ('正在结束 MyPortfolio（pid=' + $p + '）'); Start-Process taskkill -ArgumentList @('/PID', $p, '/T', '/F') -Wait -WindowStyle Hidden; Remove-Item $pidFile -Force -ErrorAction SilentlyContinue; Write-Host 'MyPortfolio 已退出' } else { Write-Host '未发现运行中的 MyPortfolio（.myportfolio.pid 不存在）' }"
exit /b 0
