$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '..\Manage-Launcher.ps1') -Action Functions
$fixture=Join-Path ([IO.Path]::GetTempPath()) ('reply-addon-install-test-'+[guid]::NewGuid().ToString('N'))
$upstream=Join-Path $fixture 'upstream';$addon=Join-Path $fixture 'addon';$startup=Join-Path $fixture 'startup';$desktop=Join-Path $fixture 'desktop'
New-Item -ItemType Directory -Path $upstream,$startup,$desktop -Force | Out-Null
@{AppExe=(Join-Path $env:SystemRoot 'System32\notepad.exe')}|ConvertTo-Json|Set-Content (Join-Path $upstream 'config.json')
Set-Content (Join-Path $upstream 'manage-windows.ps1') '# fixture'
$shortcutShell=New-Object -ComObject WScript.Shell
function Assert($v,$message){if(!$v){throw $message};Write-Host ('PASS: '+$message)}
try{
 Install-ReplyAddon $upstream $addon $startup -NoStart
 Assert (Test-Path (Join-Path $addon 'agent.cjs')) 'Addon source installed independently'
 Assert (Test-Path (Join-Path $startup 'Codex Reply Usage Background.lnk')) 'Persistent background shortcut created'
 $supervisor=Join-Path $addon 'Manage-ReplyUsage.ps1'
 Set-BadgeShortcuts $upstream @($desktop) $supervisor
 $link=$shortcutShell.CreateShortcut((Join-Path $desktop 'Codex (Usage Badge).lnk'))
 Assert ($link.Arguments -eq (Get-LauncherArguments $supervisor)) 'Launch entry starts independent addon supervisor'
 $renamedPath=Join-Path $desktop 'Codex.lnk';$renamed=$shortcutShell.CreateShortcut($renamedPath);$renamed.TargetPath=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe';$renamed.Arguments=Get-LauncherArguments (Join-Path $upstream 'manage-windows.ps1');$renamed.Save()
 Set-BadgeShortcuts $upstream @($desktop) $supervisor
 Assert ($shortcutShell.CreateShortcut($renamedPath).Arguments -eq (Get-LauncherArguments $supervisor)) 'User-renamed owned launcher is upgraded'
 Install-ReplyAddon $upstream $addon $startup -NoStart
 Assert (@(Get-ChildItem (Join-Path $addon 'backups') -Recurse -Filter 'agent.cjs').Count -ge 1) 'Repeat install retains previous sources as backup'
 Remove-BadgeShortcuts $upstream @($desktop) $supervisor
 Assert (!(Test-Path (Join-Path $desktop 'Codex (Usage Badge).lnk'))) 'Owned addon launcher removed'
 Assert (!(Test-Path -LiteralPath $renamedPath)) 'User-renamed owned launcher is removed on uninstall'
 Remove-ReplyStartup $addon $startup
 Assert (!(Test-Path (Join-Path $startup 'Codex Reply Usage Background.lnk'))) 'Owned background shortcut removed'
 $foreign=Join-Path $fixture 'foreign';New-Item -ItemType Directory $foreign|Out-Null
 $rejected=$false;try{Install-ReplyAddon $upstream $foreign $startup -NoStart}catch{$rejected=$true}
 Assert $rejected 'Unrelated installation directory rejected'
 $foreignLink=$shortcutShell.CreateShortcut((Join-Path $startup 'Codex Reply Usage Background.lnk'));$foreignLink.TargetPath=Join-Path $env:SystemRoot 'System32\notepad.exe';$foreignLink.Save()
 $rejected=$false;try{Install-ReplyAddon $upstream $addon $startup -NoStart}catch{$rejected=$true}
 Assert $rejected 'Unrelated startup shortcut rejected'
 Remove-ReplyStartup $addon $startup
 Assert (Test-Path (Join-Path $startup 'Codex Reply Usage Background.lnk')) 'Unrelated startup shortcut preserved during uninstall'
 $sandboxLocal=Join-Path $fixture 'local-appdata';$foreignAddon=Join-Path $sandboxLocal 'CodexUsageBadgeLauncher'
 New-Item -ItemType Directory -Path $foreignAddon -Force|Out-Null
 $sentinel=Join-Path $fixture 'foreign-script-executed.txt'
 Set-Content -LiteralPath (Join-Path $foreignAddon 'Manage-ReplyUsage.ps1') -Value ("[IO.File]::WriteAllText('"+$sentinel+"','executed')")
 $savedLocal=$env:LOCALAPPDATA
 $savedErrorAction=$ErrorActionPreference
 try{
  $env:LOCALAPPDATA=$sandboxLocal
  $ErrorActionPreference='Continue'
  $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  & $powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot '..\Manage-Launcher.ps1') -Action Uninstall -InstallRoot $upstream -DesktopDirectory $desktop -ProgramsDirectory $desktop 2>$null | Out-Null
  $uninstallExit=$LASTEXITCODE
 }finally{$env:LOCALAPPDATA=$savedLocal;$ErrorActionPreference=$savedErrorAction}
 Assert (!(Test-Path -LiteralPath $sentinel)) 'Foreign addon script is never invoked during uninstall'
 Assert ($uninstallExit -ne 0) 'Uninstall rejects unowned addon directory'
 Write-Host 'All 13 addon installation checks passed.'
}finally{
 $resolved=[IO.Path]::GetFullPath($fixture);$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
 if(!$resolved.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolved -Leaf) -notlike 'reply-addon-install-test-*'){throw 'Unsafe fixture cleanup'}
 Remove-Item -LiteralPath $resolved -Recurse -Force
}
