param([ValidateSet('Start','Run','Stop','Launch','Status','Functions')][string]$Action='Status')
$ErrorActionPreference='Stop'
$addonRoot=$PSScriptRoot
$stopFile=Join-Path $addonRoot 'reply-usage.stop'
$ownerFile=Join-Path $addonRoot '.reply-usage-owner'
function Get-ReplyMutexName {
    $hash=[Security.Cryptography.SHA256]::Create()
    try { $id=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($addonRoot.ToLowerInvariant()))).Replace('-','').Substring(0,20) } finally { $hash.Dispose() }
    return ('Local\CodexReplyUsage.'+[Security.Principal.WindowsIdentity]::GetCurrent().User.Value+'.'+$id)
}
function Test-ReplyRunning {
    $mutex=$null
    try {
        $mutex=[Threading.Mutex]::OpenExisting((Get-ReplyMutexName))
        try { $owned=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $owned=$true }
        if($owned){$mutex.ReleaseMutex();return $false};return $true
    } catch [Threading.WaitHandleCannotBeOpenedException] { return $false }
    finally { if($mutex){$mutex.Dispose()} }
}
function Start-ReplySupervisor {
    if(Test-ReplyRunning){return}
    if(Test-Path -LiteralPath $stopFile){Remove-Item -LiteralPath $stopFile -Force}
    $shell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $arguments='-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "'+(Join-Path $addonRoot 'Manage-ReplyUsage.ps1')+'" -Action Run'
    Start-Process -FilePath $shell -ArgumentList $arguments -WindowStyle Hidden | Out-Null
}
if($Action -eq 'Functions'){return}
try {
    if(!(Test-Path -LiteralPath $ownerFile) -or (Get-Content -LiteralPath $ownerFile -Raw).Trim() -ne 'local.codexusagebadge.replyaddon'){throw 'Reply addon ownership marker is missing.'}
    $addonConfig=Get-Content -LiteralPath (Join-Path $addonRoot 'addon-config.json') -Raw | ConvertFrom-Json
    $upstreamConfig=Join-Path $addonConfig.UpstreamRoot 'config.json'
    switch($Action){
        'Start' { Start-ReplySupervisor }
        'Stop' {
            [IO.File]::WriteAllText($stopFile,'stop')
            $deadline=[DateTime]::UtcNow.AddSeconds(30)
            while((Test-ReplyRunning) -and [DateTime]::UtcNow -lt $deadline){Start-Sleep -Milliseconds 200}
            if(Test-ReplyRunning){throw 'Reply addon did not stop in time. No unrelated processes were terminated.'}
        }
        'Run' {
            $mutex=New-Object Threading.Mutex($false,(Get-ReplyMutexName));$owned=$false
            try {
                try{$owned=$mutex.WaitOne(0)}catch [Threading.AbandonedMutexException]{$owned=$true}
                if(!$owned){return}
                if(Test-Path -LiteralPath $stopFile){Remove-Item -LiteralPath $stopFile -Force}
                while(!(Test-Path -LiteralPath $stopFile)){
                    try {
                        $config=Get-Content -LiteralPath $upstreamConfig -Raw | ConvertFrom-Json
                        if(!(Test-Path -LiteralPath $config.NodeExe)){throw 'Runtime unavailable'}
                        $arguments='"'+(Join-Path $addonRoot 'agent.cjs')+'" --root "'+$addonRoot+'" --config "'+$upstreamConfig+'"'
                        $child=Start-Process -FilePath $config.NodeExe -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $addonRoot 'reply-usage-error.log')
                        $child.WaitForExit();$child.Dispose()
                    } catch { }
                    if(!(Test-Path -LiteralPath $stopFile)){Start-Sleep -Seconds 3}
                }
            } finally { if($owned){$mutex.ReleaseMutex()};$mutex.Dispose() }
        }
        'Launch' {
            Start-ReplySupervisor
            $manager=Join-Path $addonConfig.UpstreamRoot 'manage-windows.ps1'
            $shell=Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
            & $shell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $manager -Action Launch
            if($LASTEXITCODE -ne 0){throw 'Fully quit Codex, then open Codex (Usage Badge) again.'}
        }
        'Status' {
            [pscustomobject]@{SupervisorRunning=(Test-ReplyRunning);Version='1.1.0'} | Format-List
            $state=Join-Path $addonRoot 'reply-usage-state.json';if(Test-Path -LiteralPath $state){Get-Content -LiteralPath $state -Raw}
        }
    }
} catch {
    if($Action -eq 'Launch'){
        Add-Type -AssemblyName System.Windows.Forms
        [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'Codex Usage Badge')
    }else{Write-Error $_}
    exit 1
}
