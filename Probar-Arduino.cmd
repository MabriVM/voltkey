@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VoltKey ARDUINO TEST 1.2 - Prueba Arduino UNO R3

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python no esta instalado o no esta en PATH.
  echo Instala Python 3.11 o superior y marca Add Python to PATH.
  pause
  exit /b 1
)

echo [VOLTKEY] Instalando el controlador de comunicacion USB si es necesario...
python -m pip install --disable-pip-version-check "pyserial>=3.5,<4"
if errorlevel 1 (
  echo [ERROR] No se pudo instalar pyserial.
  pause
  exit /b 1
)

echo.
echo Cierra Arduino IDE, su Monitor Serie y cualquier VoltKey abierto.
echo Conecta el UNO R3 por USB y presiona una tecla para comenzar.
pause >nul
python -m servidor.probar_arduino
echo.
pause
endlocal
