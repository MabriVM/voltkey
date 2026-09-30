@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VoltKey ARDUINO TEST 1.2 - Base 1.12.0

if not exist "scripts\Iniciar-Sistema.ps1" (
  echo [ERROR] Falta scripts\Iniciar-Sistema.ps1. Conserva la estructura completa del proyecto.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Iniciar-Sistema.ps1"
if errorlevel 1 pause
endlocal
