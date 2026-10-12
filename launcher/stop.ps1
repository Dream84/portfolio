# Stops the MyPortfolio launcher started by tray.ps1 (reads .myportfolio.pid and kills the tree).
# ASCII-only on purpose (Windows PowerShell 5.1 compatibility).

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$pidFile = Join-Path $root ".myportfolio.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "MyPortfolio is not running (.myportfolio.pid not found)."
  exit 0
}

$launcherPid = [int](Get-Content $pidFile)
Write-Host "Stopping MyPortfolio (pid=$launcherPid) ..."
Start-Process taskkill -ArgumentList @("/PID", $launcherPid, "/T", "/F") -Wait -WindowStyle Hidden
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "MyPortfolio stopped."
exit 0
