param(
    [ValidateSet('Install','Uninstall','Verify','Functions')][string]$Action = 'Verify',
    [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'CodexUsageBadge'),
    [string]$DesktopDirectory = [Environment]::GetFolderPath('DesktopDirectory'),
    [string]$ProgramsDirectory = [Environment]::GetFolderPath('Programs')
)
$ErrorActionPreference = 'Stop'

function Get-LauncherArguments([string]$Manager) {
    '-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Manager + '" -Action Launch'
}
function Get-LegacyLauncherName {
    return ('Codex'+[char]0xff08+[char]0x5e26+[char]0x7528+[char]0x91cf+[char]0x6761+[char]0xff09+'.lnk')
}
function Assert-ReplyOwner([string]$AddonRoot) {
    $marker=Join-Path $AddonRoot '.reply-usage-owner'
    if(!(Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne 'local.codexusagebadge.replyaddon'){throw 'Unowned reply addon directory; no script was executed.'}
}
function Set-BadgeShortcuts([string]$Root, [string[]]$Directories, [string]$Launcher='') {
    $upstreamManager = Join-Path $Root 'manage-windows.ps1'
    $manager = if($Launcher){$Launcher}else{$upstreamManager}
    $config = Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw | ConvertFrom-Json
    if (!(Test-Path -LiteralPath $manager) -or !(Test-Path -LiteralPath $config.AppExe)) {
        throw 'Codex Usage Badge or Codex executable is missing.'
    }
    $shell = New-Object -ComObject WScript.Shell
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $paths = @($Directories | Select-Object -Unique | ForEach-Object { Join-Path $_ 'Codex (Usage Badge).lnk' })
    foreach($directory in $Directories){foreach($file in @(Get-ChildItem -LiteralPath $directory -File -Filter '*.lnk' -ErrorAction SilentlyContinue)){$old=$shell.CreateShortcut($file.FullName);if($old.TargetPath -eq $powershell -and $old.Arguments -in @((Get-LauncherArguments $upstreamManager),(Get-LauncherArguments $manager))){$paths+=$file.FullName}}}
    $paths=@($paths|Select-Object -Unique)
    # Check every destination before changing any shortcut.
    foreach ($linkPath in $paths) {
        if (Test-Path -LiteralPath $linkPath) {
            $old = $shell.CreateShortcut($linkPath)
            if ($old.TargetPath -ne $powershell -or ($old.Arguments -ne (Get-LauncherArguments $manager) -and $old.Arguments -ne (Get-LauncherArguments $upstreamManager))) {
                throw "Unrelated shortcut already exists; it was not changed: $linkPath"
            }
        }
    }
    foreach ($linkPath in $paths) {
        $link = $shell.CreateShortcut($linkPath)
        $link.TargetPath = $powershell
        $link.Arguments = Get-LauncherArguments $manager
        $link.WorkingDirectory = $Root
        $link.IconLocation = $config.AppExe + ',0'
        $link.Description = 'Start Codex with Usage Badge enabled.'
        $link.WindowStyle = 7
        $link.Save()
    }
}
function Remove-BadgeShortcuts([string]$Root, [string[]]$Directories, [string]$Launcher='') {
    $shell = New-Object -ComObject WScript.Shell
    $expected = Get-LauncherArguments (Join-Path $Root 'manage-windows.ps1')
    $addonExpected = if($Launcher){Get-LauncherArguments $Launcher}else{$expected}
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($directory in @($Directories | Select-Object -Unique)) {
      foreach($name in @('Codex (Usage Badge).lnk',(Get-LegacyLauncherName))+@(Get-ChildItem -LiteralPath $directory -File -Filter '*.lnk' -ErrorAction SilentlyContinue|Select-Object -ExpandProperty Name)|Select-Object -Unique){
        $linkPath = Join-Path $directory $name
        if (Test-Path -LiteralPath $linkPath) {
            $link = $shell.CreateShortcut($linkPath)
            if ($link.TargetPath -eq $powershell -and $link.Arguments -in @($expected,$addonExpected)) {
                Remove-Item -LiteralPath $linkPath
            }
        }
      }
    }
}
function Install-ReplyAddon([string]$Root,[string]$AddonRoot,[string]$StartupDirectory,[switch]$NoStart) {
    $owner='local.codexusagebadge.replyaddon'
    $marker=Join-Path $AddonRoot '.reply-usage-owner'
    $supervisor=Join-Path $AddonRoot 'Manage-ReplyUsage.ps1'
    $shell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $shortcutShell=New-Object -ComObject WScript.Shell
    $startupLink=Join-Path $StartupDirectory 'Codex Reply Usage Background.lnk'
    $runArguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+$supervisor+'" -Action Run'
    if(Test-Path -LiteralPath $AddonRoot){
        if(!(Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne $owner){throw 'Unrelated addon directory exists; not changed.'}
    }
    if(Test-Path -LiteralPath $startupLink){
        $existing=$shortcutShell.CreateShortcut($startupLink)
        if($existing.TargetPath -ne $shell -or $existing.Arguments -ne $runArguments){throw 'Unrelated startup shortcut exists; not changed.'}
    }
    if((Test-Path -LiteralPath $supervisor) -and !$NoStart){
        & $shell -NoProfile -ExecutionPolicy Bypass -File $supervisor -Action Stop
        if($LASTEXITCODE -ne 0){throw 'Could not stop previous reply addon.'}
    }
    New-Item -ItemType Directory -Path $AddonRoot -Force | Out-Null
    $source=Join-Path $PSScriptRoot 'addons\reply-usage'
    $backup=Join-Path $AddonRoot ('backups\'+[DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-ffff'))
    foreach($name in @('usage-reader.cjs','renderer.cjs','agent.cjs','Manage-ReplyUsage.ps1')){
        $destination=Join-Path $AddonRoot $name
        if(Test-Path -LiteralPath $destination){New-Item -ItemType Directory -Path $backup -Force | Out-Null;Copy-Item -LiteralPath $destination -Destination (Join-Path $backup $name)}
        Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force
    }
    [IO.File]::WriteAllText($marker,$owner,(New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText((Join-Path $AddonRoot 'addon-config.json'),(@{UpstreamRoot=$Root}|ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
    $link=$shortcutShell.CreateShortcut($startupLink);$link.TargetPath=$shell;$link.Arguments=$runArguments;$link.WorkingDirectory=$AddonRoot;$link.WindowStyle=7;$link.Save()
    if(!$NoStart){& $shell -NoProfile -ExecutionPolicy Bypass -File $supervisor -Action Start;if($LASTEXITCODE -ne 0){throw 'Reply addon could not start.'}}
}
function Remove-ReplyStartup([string]$AddonRoot,[string]$StartupDirectory){
    $path=Join-Path $StartupDirectory 'Codex Reply Usage Background.lnk'
    if(!(Test-Path -LiteralPath $path)){return}
    $shell=New-Object -ComObject WScript.Shell;$link=$shell.CreateShortcut($path)
    $expected='-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $AddonRoot 'Manage-ReplyUsage.ps1')+'" -Action Run'
    $powershell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if($link.TargetPath -eq $powershell -and $link.Arguments -eq $expected){Remove-Item -LiteralPath $path}
}
if ($Action -eq 'Functions') { return }
try {
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $addonRoot = Join-Path $env:LOCALAPPDATA 'CodexUsageBadgeLauncher'
    $addonSupervisor = Join-Path $addonRoot 'Manage-ReplyUsage.ps1'
    if ($Action -eq 'Install') {
        $upstream = Join-Path $PSScriptRoot 'vendor\CodexUsageBadge-Windows-0.10.1\manage-windows.ps1'
        & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $upstream -Action Install
        if ($LASTEXITCODE -ne 0) { throw 'Upstream installation failed; shortcuts were not created.' }
        Install-ReplyAddon $InstallRoot $addonRoot ([Environment]::GetFolderPath('Startup'))
        Set-BadgeShortcuts $InstallRoot @($DesktopDirectory,$ProgramsDirectory) $addonSupervisor
        Write-Host 'Installed. Fully quit Codex, then open Codex (Usage Badge) from Desktop or Start menu.'
        Write-Host 'Pin that shortcut to the taskbar instead of the original Store entry.'
    } elseif ($Action -eq 'Uninstall') {
        if(Test-Path -LiteralPath $addonRoot){Assert-ReplyOwner $addonRoot}
        if(Test-Path -LiteralPath $addonSupervisor){& $powershell -NoProfile -ExecutionPolicy Bypass -File $addonSupervisor -Action Stop;if($LASTEXITCODE -ne 0){throw 'Reply addon could not stop.'}}
        $manager = Join-Path $InstallRoot 'manage-windows.ps1'
        if (Test-Path -LiteralPath $manager) {
            & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $manager -Action Uninstall
            if ($LASTEXITCODE -ne 0) { throw 'Upstream uninstall failed; shortcuts were preserved.' }
        }
        Remove-BadgeShortcuts $InstallRoot @($DesktopDirectory,$ProgramsDirectory) $addonSupervisor
        Remove-ReplyStartup $addonRoot ([Environment]::GetFolderPath('Startup'))
        Write-Host 'Uninstalled. Upstream backups are retained.'
    } else {
        $manager = Join-Path $InstallRoot 'manage-windows.ps1'
        if (!(Test-Path -LiteralPath $manager)) { throw 'Not installed.' }
        & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $manager -Action Status
        if ($LASTEXITCODE -ne 0) { throw 'Status check failed.' }
        if(Test-Path -LiteralPath $addonSupervisor){Assert-ReplyOwner $addonRoot;& $powershell -NoProfile -ExecutionPolicy Bypass -File $addonSupervisor -Action Status}
    }
} catch {
    Write-Error $_
    exit 1
}
