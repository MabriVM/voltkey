@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Actualizar Arduino - VoltKey ARDUINO TEST 1.2
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Actualizar-Arduino.ps1"
if errorlevel 1 pause
endlocal
