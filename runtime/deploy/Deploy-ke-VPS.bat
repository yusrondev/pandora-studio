@echo off
rem Unggah game ke VPS dan pasang otomatis. Memakai ssh/scp bawaan Windows 10+.
rem Pemakaian: Deploy-ke-VPS.bat root@ip-server [domain] [email-https]
setlocal
cd /d "%~dp0"

if "%~1"=="" (
    set /p TARGET=Alamat VPS ^(contoh root@203.0.113.10^):
) else (
    set "TARGET=%~1"
)
if "%TARGET%"=="" exit /b 1

set "DOMAIN=%~2"
set "EMAIL=%~3"
for %%I in (.) do set "SLUG=%%~nxI"
set "ARCHIVE=%TEMP%\%SLUG%.tar.gz"

echo Mengemas game...
tar -czf "%ARCHIVE%" -C .. "%SLUG%"
if errorlevel 1 goto gagal

echo Mengunggah ke %TARGET%...
scp "%ARCHIVE%" "%TARGET%:/tmp/%SLUG%.tar.gz"
if errorlevel 1 goto gagal

echo Memasang di server...
ssh -t "%TARGET%" "cd /tmp && rm -rf '/tmp/%SLUG%' && tar -xzf '/tmp/%SLUG%.tar.gz' && sudo sh '/tmp/%SLUG%/deploy/install-vps.sh' %DOMAIN% %EMAIL% && rm -rf '/tmp/%SLUG%' '/tmp/%SLUG%.tar.gz'"
if errorlevel 1 goto gagal

del "%ARCHIVE%" >nul 2>&1
echo.
echo Deploy selesai.
pause
exit /b 0

:gagal
echo.
echo Deploy gagal. Periksa alamat VPS dan akses SSH.
pause
exit /b 1
