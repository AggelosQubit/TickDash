$tickdash = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $tickdash "start-daemon.vbs"
$lnk = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\TickDash.lnk"

$s = New-Object -ComObject WScript.Shell
$k = $s.CreateShortcut($lnk)
$k.TargetPath = "wscript.exe"
$k.Arguments = "//B `"$vbs`""
$k.WorkingDirectory = $tickdash
$k.WindowStyle = 7
$k.Description = "TickDash LoL daemon (silent)"
$k.Save()

Write-Host "[TickDash] Startup shortcut:" $lnk
