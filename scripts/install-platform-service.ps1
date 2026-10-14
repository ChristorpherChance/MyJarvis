param([ValidateSet('Install','Start','Stop','Status','Uninstall')][string]$Mode='Status',[switch]$Interactive)
$ErrorActionPreference='Stop'
$jarvisWorkspace = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$jarvisNode = (Get-Command node -ErrorAction Stop).Source
$jarvisServiceScript = Join-Path $PSScriptRoot 'platform-service.mjs'
$jarvisTaskShell = Join-Path ([Environment]::GetFolderPath('System')) 'WindowsPowerShell/v1.0/powershell.exe'
$jarvisIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$jarvisHasher = [Security.Cryptography.SHA256]::Create()
try { $jarvisDigest = ([BitConverter]::ToString($jarvisHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($jarvisWorkspace.ToLowerInvariant())))).Replace('-','').Substring(0,12) } finally { $jarvisHasher.Dispose() }
$jarvisTaskName = 'Jarvis-MyJevis-' + $jarvisDigest
$jarvisLegacyArguments = '"' + $jarvisServiceScript + '" run'
$jarvisArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + (Join-Path $PSScriptRoot 'run-platform-service.ps1') + '"'
$jarvisExisting = Get-ScheduledTask -TaskName $jarvisTaskName -ErrorAction SilentlyContinue
if ($jarvisExisting) { $jarvisKnownAction = $jarvisExisting.Actions.Count -eq 1 -and (($jarvisExisting.Actions[0].Execute -eq $jarvisNode -and $jarvisExisting.Actions[0].Arguments -eq $jarvisLegacyArguments) -or ($jarvisExisting.Actions[0].Execute -eq $jarvisTaskShell -and $jarvisExisting.Actions[0].Arguments -eq $jarvisArguments)); if (!$jarvisKnownAction) { throw '同名任务不是本项目的常驻服务，未覆盖' } }
switch ($Mode) {
 'Install' {
  if (!(Test-Path -LiteralPath (Join-Path $jarvisWorkspace 'apps/api/dist/index.js'))) { throw '请先构建项目' }
  $jarvisAction = New-ScheduledTaskAction -Execute $jarvisTaskShell -Argument $jarvisArguments -WorkingDirectory $jarvisWorkspace
  $jarvisPrincipal = New-ScheduledTaskPrincipal -UserId $jarvisIdentity.Name -LogonType $(if($Interactive){'Interactive'}else{'S4U'}) -RunLevel Limited
  $jarvisTriggers = if($Interactive){@((New-ScheduledTaskTrigger -AtLogOn -User $jarvisIdentity.Name))}else{@((New-ScheduledTaskTrigger -AtStartup),(New-ScheduledTaskTrigger -AtLogOn -User $jarvisIdentity.Name))}
  $jarvisSettings = New-ScheduledTaskSettingsSet -Hidden -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName $jarvisTaskName -Action $jarvisAction -Trigger $jarvisTriggers -Principal $jarvisPrincipal -Settings $jarvisSettings -Description ('贾维斯中央服务；固定项目：' + $jarvisWorkspace + '；低权限，无保存账户密码') -Force -ErrorAction Stop | Out-Null
  $jarvisInstalled = Get-ScheduledTask -TaskName $jarvisTaskName -ErrorAction Stop
  if ($jarvisInstalled.Actions[0].Arguments -ne $jarvisArguments) { throw '注册后的常驻配置不匹配' }
  Write-Output ('常驻任务已安装：' + $jarvisTaskName)
 }
 'Start' { if (!$jarvisExisting) { throw '常驻任务尚未安装' }; Start-ScheduledTask -TaskName $jarvisTaskName }
 'Stop' { if ($jarvisExisting) { & $jarvisNode $jarvisServiceScript stop; if ($LASTEXITCODE -ne 0) { throw '未能正常停止常驻进程；没有强制结束其他进程' } } }
 'Uninstall' { if ($jarvisExisting) { & $jarvisNode $jarvisServiceScript stop; if ($LASTEXITCODE -ne 0 -and $jarvisExisting.State -eq 'Running') { throw '任务仍在运行，未卸载' }; Unregister-ScheduledTask -TaskName $jarvisTaskName -Confirm:$false; Write-Output '本项目常驻任务已卸载' } }
 'Status' { if ($jarvisExisting) { $jarvisInfo=Get-ScheduledTaskInfo -TaskName $jarvisTaskName; [PSCustomObject]@{Task=$jarvisTaskName;State=$jarvisExisting.State.ToString();LastResult=$jarvisInfo.LastTaskResult;Node=$jarvisNode;Workspace=$jarvisWorkspace;LogonType=$jarvisExisting.Principal.LogonType.ToString()} | ConvertTo-Json -Compress } else { Write-Output '本项目常驻任务尚未安装' } }
}
