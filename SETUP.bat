@echo off
echo === SAFlow Extension setup ===
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0host\install.ps1"
echo.
echo Now add the "extension" folder to your browser (see README.md), then restart the browser.
pause
