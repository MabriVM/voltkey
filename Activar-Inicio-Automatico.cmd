@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Activar inicio automatico - VoltKey ARDUINO TEST 1.2

set "VOLTKEY_TARGET=%~dp0Iniciar-VoltKey.cmd"
set "VOLTKEY_WORKDIR=%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$startup=[Environment]::GetFolderPath('Startup'); $link=Join-Path $startup 'VoltKey Arduino Test.lnk'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut($link); $shortcut.TargetPath=$env:VOLTKEY_TARGET; $shortcut.WorkingDirectory=$env:VOLTKEY_WORKDIR; $shortcut.Description='Iniciar VoltKey Arduino Test 1.2'; $shortcut.Save()"

if errorlevel 1 (
  echo [ERROR] Windows no pudo crear el acceso de inicio automatico.
  pause
  exit /b 1
)

echo [LISTO] VoltKey ARDUINO TEST 1.2 se iniciara al entrar a tu sesion de Windows.
echo Puedes desactivarlo con Desactivar-Inicio-Automatico.cmd.
pause
endlocal
