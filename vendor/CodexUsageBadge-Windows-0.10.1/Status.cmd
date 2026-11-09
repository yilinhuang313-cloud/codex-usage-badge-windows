@echo off
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage-windows.ps1" -Action Status
set "BADGE_EXIT=%ERRORLEVEL%"
if not "%BADGE_EXIT%"=="0" echo Operation failed. See the message above.
pause
exit /b %BADGE_EXIT%
