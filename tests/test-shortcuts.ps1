$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\Manage-Launcher.ps1') -Action Functions
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('badge-launcher-test-' + [guid]::NewGuid().ToString('N'))
$root = Join-Path $fixture 'install with spaces'
$desktop = Join-Path $fixture 'desktop'
$programs = Join-Path $fixture 'programs'
New-Item -ItemType Directory -Path $root,$desktop,$programs -Force | Out-Null
Set-Content -LiteralPath (Join-Path $root 'manage-windows.ps1') -Value '# fixture only'
@{AppExe=(Join-Path $env:SystemRoot 'System32\notepad.exe')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'config.json')
$shell = New-Object -ComObject WScript.Shell
function Assert($condition, $message) { if (!$condition) { throw $message }; Write-Host "PASS: $message" }
try {
    Set-BadgeShortcuts $root @($desktop,$programs)
    $desktopLink = Join-Path $desktop 'Codex (Usage Badge).lnk'
    $programsLink = Join-Path $programs 'Codex (Usage Badge).lnk'
    Assert ((Test-Path $desktopLink) -and (Test-Path $programsLink)) 'Both shortcut locations created'
    $link = $shell.CreateShortcut($desktopLink)
    Assert ($link.Arguments -eq (Get-LauncherArguments (Join-Path $root 'manage-windows.ps1'))) 'Quoted path with spaces and Launch action retained'
    Assert ($link.IconLocation -like '*notepad.exe,0') 'Application icon used'
    Set-BadgeShortcuts $root @($desktop,$programs)
    Assert ((Test-Path $desktopLink) -and (Test-Path $programsLink)) 'Repeated install succeeds'
    $foreign = $shell.CreateShortcut($programsLink)
    $foreign.TargetPath = Join-Path $env:SystemRoot 'System32\notepad.exe'
    $foreign.Arguments = ''
    $foreign.Save()
    $collision = $false
    try { Set-BadgeShortcuts $root @($desktop,$programs) } catch { $collision = $true }
    Assert $collision 'Unrelated shortcut is rejected'
    Remove-BadgeShortcuts $root @($desktop,$programs)
    Assert (!(Test-Path $desktopLink)) 'Owned shortcut removed'
    Assert (Test-Path $programsLink) 'Unrelated shortcut preserved'
    Remove-BadgeShortcuts $root @($desktop,$programs)
    Assert (Test-Path $programsLink) 'Repeated uninstall preserves unrelated shortcut'
    Write-Host 'All 8 checks passed.'
} finally {
    $resolvedFixture = [IO.Path]::GetFullPath($fixture)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if (!$resolvedFixture.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path $resolvedFixture -Leaf) -notlike 'badge-launcher-test-*') { throw 'Unsafe fixture cleanup path' }
    Remove-Item -LiteralPath $resolvedFixture -Recurse -Force
}
