# MyPortfolio tray launcher (Windows, uses built-in .NET/WinForms only, no third-party deps)
# Starts launcher/app.mjs in background (static site + API) and shows a tray icon with:
#   Open MyPortfolio / View log / Exit
# Exit also terminates the API child process so no port is left behind.
# NOTE: keep this file ASCII-only so Windows PowerShell 5.1 (ANSI default) can parse it.

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

$nodeCandidates = @(
  (Join-Path $root "runtime\node.exe"),
  (Join-Path $env:ProgramFiles "nodejs\node.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe")
)
$node = $null
foreach ($candidate in $nodeCandidates) {
  if (Test-Path $candidate) { $node = $candidate; break }
}
if (-not $node) {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source }
}
if (-not $node) {
  [System.Windows.Forms.MessageBox]::Show("Node runtime not found. Put node.exe into myportfolio\runtime\ and retry.", "MyPortfolio") | Out-Null
  exit 1
}

$logFile = Join-Path $root "app.log"
$errFile = Join-Path $root "app.err.log"
$proc = Start-Process -FilePath $node -ArgumentList @("launcher\app.mjs") -WorkingDirectory $root -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $logFile -RedirectStandardError $errFile

if (-not $proc) {
  [System.Windows.Forms.MessageBox]::Show("Failed to start launcher/app.mjs", "MyPortfolio") | Out-Null
  exit 1
}

$url = "http://127.0.0.1:5183/"
Start-Sleep -Seconds 4
if (Test-Path $logFile) {
  $text = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
  if ($text -match "http://127\.0\.0\.1:[0-9]+") { $url = $Matches[0] }
}

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Text = "MyPortfolio running"
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add("Open MyPortfolio")
$openItem.add_Click({ Start-Process $url })

$logItem = $menu.Items.Add("View log")
$logItem.add_Click({ Start-Process notepad.exe $logFile })

$menu.Items.Add("-") | Out-Null

$exitItem = $menu.Items.Add("Exit MyPortfolio")
$exitItem.add_Click({
  if ($proc -and -not $proc.HasExited) {
    Start-Process taskkill -ArgumentList @("/PID", $proc.Id, "/T", "/F") -Wait -WindowStyle Hidden
  }
  $pidFile = Join-Path $root ".myportfolio.pid"
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force -ErrorAction SilentlyContinue }
  $icon.Visible = $false
  $icon.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$icon.ContextMenuStrip = $menu
$icon.add_MouseDoubleClick({ Start-Process $url })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({
  if ($proc.HasExited) {
    $icon.Visible = $false
    $icon.Dispose()
    [System.Windows.Forms.Application]::Exit()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
