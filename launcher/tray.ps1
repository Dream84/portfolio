# MyPortfolio 托盘启动器（Windows，仅使用系统自带 .NET/WinForms，无第三方依赖）
# 行为：后台启动 launcher/app.mjs（静态页面 + 接口），托盘图标提供「打开页面 / 打开日志 / 退出」
# 退出时连同接口子进程一起结束，避免端口残留。

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$nodeCandidates = @(
  (Join-Path $root "runtime\node.exe"),
  "node"
)
$node = $null
foreach ($candidate in $nodeCandidates) {
  if ($candidate -eq "node") { $node = "node"; break }
  if (Test-Path $candidate) { $node = $candidate; break }
}

$logFile = Join-Path $root "app.log"
$nodeArgs = @("launcher\app.mjs")

$proc = Start-Process -FilePath $node -ArgumentList $nodeArgs -WorkingDirectory $root -PassThru -WindowStyle Hidden `
  -RedirectStandardOutput $logFile -RedirectStandardError $logFile

$url = "http://127.0.0.1:5183/"
Start-Sleep -Seconds 3
if (Test-Path $logFile) {
  $text = Get-Content $logFile -Raw -ErrorAction SilentlyContinue
  if ($text -match "页面地址：(http://[^\s]+)") { $url = $Matches[1] }
}

$icon = New-Object System.Windows.Forms.NotifyIcon
$icon.Icon = [System.Drawing.SystemIcons]::Application
$icon.Text = "MyPortfolio 正在运行"
$icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$openItem = $menu.Items.Add("打开 MyPortfolio")
$openItem.add_Click({ Start-Process $url })

$logItem = $menu.Items.Add("查看运行日志")
$logItem.add_Click({ Start-Process notepad.exe $logFile })

$menu.Items.Add("-") | Out-Null

$exitItem = $menu.Items.Add("退出 MyPortfolio")
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

# 进程自行退出时同步移除托盘图标
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
