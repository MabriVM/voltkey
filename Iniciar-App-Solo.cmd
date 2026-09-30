@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VoltKey ARDUINO TEST 1.2 - Solo Expo

echo [VOLTKEY] Este modo usa la direccion guardada en .env y no inicia Python ni Cloudflare.
echo [VOLTKEY] Iniciando Expo y la interfaz web...
call npx expo start --tunnel --web --clear
if errorlevel 1 pause
endlocal
