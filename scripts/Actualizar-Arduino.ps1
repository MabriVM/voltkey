$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Sketch = Join-Path $ProjectRoot "arduino\VoltKey_Uno_R3"
$BuildDir = Join-Path $ProjectRoot ".voltkey-runtime\arduino-build"

function Write-Step([string]$Text) { Write-Host "[ARDUINO] $Text" -ForegroundColor Cyan }
function Find-Cli {
  $Found = Get-Command "arduino-cli" -ErrorAction SilentlyContinue
  if ($Found) { return $Found.Source }
  $Candidates = @(
    (Join-Path $ProjectRoot "tools\arduino-cli.exe"),
    "$env:LOCALAPPDATA\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe",
    "$env:ProgramFiles\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
  )
  return $Candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

try {
  $Cli = Find-Cli
  if (-not $Cli) { throw "No se encontró Arduino CLI. Instala Arduino IDE 2 o arduino-cli y vuelve a ejecutar este archivo." }
  Write-Step "Herramienta: $Cli"
  $BoardText = & $Cli board list 2>&1 | Out-String
  $PortMatch = [regex]::Match($BoardText, '(COM\d+|/dev/tty(?:ACM|USB)\d+)')
  if (-not $PortMatch.Success) { throw "No se detectó un puerto serie. Conecta el UNO R3 por USB, cierra el Monitor Serie y reintenta." }
  $Port = $PortMatch.Value
  Write-Step "UNO detectado en $Port"
  & $Cli core list | Out-Null
  $CoreText = & $Cli core list 2>&1 | Out-String
  if ($CoreText -notmatch 'arduino:avr') {
    Write-Step "Instalando soporte oficial Arduino AVR..."
    & $Cli core update-index
    if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar el índice de placas." }
    & $Cli core install arduino:avr
    if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar el núcleo arduino:avr." }
  }
  New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
  Write-Step "Compilando firmware VoltKey ARDUINO TEST 1.2 (base 1.12.0)..."
  & $Cli compile --fqbn arduino:avr:uno --output-dir $BuildDir $Sketch
  if ($LASTEXITCODE -ne 0) { throw "La compilación del firmware falló." }
  Write-Step "Subiendo firmware al UNO R3..."
  & $Cli upload -p $Port --fqbn arduino:avr:uno --input-dir $BuildDir $Sketch
  if ($LASTEXITCODE -ne 0) { throw "La carga falló. Verifica el puerto y cierra cualquier Monitor Serie." }
  Write-Host "[LISTO] Arduino UNO R3 actualizado con VoltKey ARDUINO TEST 1.2." -ForegroundColor Green
  Write-Host "Ejecuta Probar-Arduino.cmd y luego Iniciar-VoltKey.cmd." -ForegroundColor Green
} catch {
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Alternativa: abre arduino\VoltKey_Uno_R3\VoltKey_Uno_R3.ino en Arduino IDE, elige Arduino Uno y pulsa Subir." -ForegroundColor Yellow
  exit 1
}
