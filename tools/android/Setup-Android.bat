@echo off
rem Pandora Studio - pasang toolchain Android (JDK 17, Gradle, Android SDK) untuk Generate APK
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-android.ps1"
echo.
pause
