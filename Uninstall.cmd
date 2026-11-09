@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Manage-Launcher.ps1" -Action Uninstall
set "BADGE_EXIT=%ERRORLEVEL%"
pause
exit /b %BADGE_EXIT%
