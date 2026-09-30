@echo off
setlocal EnableExtensions
title Desactivar inicio automatico - VoltKey ARDUINO TEST 1.2

powershell -NoProfile -ExecutionPolicy Bypass -Command "$startup=[Environment]::GetFolderPath('Startup'); $link=Join-Path $startup 'VoltKey Arduino Test.lnk'; if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }"

if errorlevel 1 (
  echo [ERROR] No se pudo quitar el acceso de inicio automatico.
  pause
  exit /b 1
)

echo [LISTO] El inicio automatico de VoltKey ARDUINO TEST 1.2 quedo desactivado.
pause
endlocal
