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
function Set-BadgeShortcuts([string]$Root, [string[]]$Directories) {
    $manager = Join-Path $Root 'manage-windows.ps1'
    $config = Get-Content -LiteralPath (Join-Path $Root 'config.json') -Raw | ConvertFrom-Json
    if (!(Test-Path -LiteralPath $manager) -or !(Test-Path -LiteralPath $config.AppExe)) {
        throw 'Codex Usage Badge or Codex executable is missing.'
    }
    $shell = New-Object -ComObject WScript.Shell
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $paths = @($Directories | Select-Object -Unique | ForEach-Object { Join-Path $_ 'Codex (Usage Badge).lnk' })
    # Check every destination before changing any shortcut.
    foreach ($linkPath in $paths) {
        if (Test-Path -LiteralPath $linkPath) {
            $old = $shell.CreateShortcut($linkPath)
            if ($old.TargetPath -ne $powershell -or $old.Arguments -ne (Get-LauncherArguments $manager)) {
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
function Remove-BadgeShortcuts([string]$Root, [string[]]$Directories) {
    $shell = New-Object -ComObject WScript.Shell
    $expected = Get-LauncherArguments (Join-Path $Root 'manage-windows.ps1')
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($directory in @($Directories | Select-Object -Unique)) {
        $linkPath = Join-Path $directory 'Codex (Usage Badge).lnk'
        if (Test-Path -LiteralPath $linkPath) {
            $link = $shell.CreateShortcut($linkPath)
            if ($link.TargetPath -eq $powershell -and $link.Arguments -eq $expected) {
                Remove-Item -LiteralPath $linkPath
            }
        }
    }
}
if ($Action -eq 'Functions') { return }
try {
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    if ($Action -eq 'Install') {
        $upstream = Join-Path $PSScriptRoot 'vendor\CodexUsageBadge-Windows-0.10.1\manage-windows.ps1'
        & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $upstream -Action Install
        if ($LASTEXITCODE -ne 0) { throw 'Upstream installation failed; shortcuts were not created.' }
        Set-BadgeShortcuts $InstallRoot @($DesktopDirectory,$ProgramsDirectory)
        Write-Host 'Installed. Fully quit Codex, then open Codex (Usage Badge) from Desktop or Start menu.'
        Write-Host 'Pin that shortcut to the taskbar instead of the original Store entry.'
    } elseif ($Action -eq 'Uninstall') {
        $manager = Join-Path $InstallRoot 'manage-windows.ps1'
        if (Test-Path -LiteralPath $manager) {
            & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $manager -Action Uninstall
            if ($LASTEXITCODE -ne 0) { throw 'Upstream uninstall failed; shortcuts were preserved.' }
        }
        Remove-BadgeShortcuts $InstallRoot @($DesktopDirectory,$ProgramsDirectory)
        Write-Host 'Uninstalled. Upstream backups are retained.'
    } else {
        $manager = Join-Path $InstallRoot 'manage-windows.ps1'
        if (!(Test-Path -LiteralPath $manager)) { throw 'Not installed.' }
        & $powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $manager -Action Status
        if ($LASTEXITCODE -ne 0) { throw 'Status check failed.' }
    }
} catch {
    Write-Error $_
    exit 1
}
