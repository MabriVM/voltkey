param(
  [switch]$SinWeb,
  [switch]$SinTunnelBackend
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $ProjectRoot ".voltkey-runtime"
$DataDir = Join-Path $ProjectRoot "servidor\data"
$BackendProcess = $null
$TunnelProcess = $null

function Write-VoltKey([string]$Message) {
  Write-Host "[VOLTKEY] $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name, [string]$Help) {
  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $Command) { throw "No se encontro $Name. $Help" }
  return $Command.Source
}

function Wait-VoltKeyHealth {
  for ($Attempt = 1; $Attempt -le 40; $Attempt++) {
    if ($BackendProcess -and $BackendProcess.HasExited) { break }
    try {
      $Response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2
      if ($Response.status -eq "ok") { return }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  $BackendError = Join-Path $RuntimeDir "backend-error.log"
  if (Test-Path $BackendError) {
    $ErrorLines = Get-Content -LiteralPath $BackendError -Tail 30 -ErrorAction SilentlyContinue
    if ($ErrorLines) {
      Write-Host ""
      Write-Host "[DETALLE DEL SERVIDOR]" -ForegroundColor Yellow
      $ErrorLines | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }
      Write-Host ""
    }
  }
  throw "El servidor Python no respondio en http://127.0.0.1:8000/health. Revisa .voltkey-runtime\backend-error.log."
}

function Wait-VoltKeyArduino {
  for ($Attempt = 1; $Attempt -le 24; $Attempt++) {
    try {
      $Response = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2
      if ($Response.arduino.connected -and $Response.arduino.serverRole -eq "UNO-SERVER-USB") { return $Response.arduino }
    } catch {
      # El servidor puede estar terminando de abrir el puerto serie.
    }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Find-TunnelUrl {
  param([string[]]$LogPaths)
  for ($Attempt = 1; $Attempt -le 120; $Attempt++) {
    if ($TunnelProcess -and $TunnelProcess.HasExited) { break }
    foreach ($LogPath in $LogPaths) {
      if (Test-Path $LogPath) {
        $Contents = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
        if ([string]::IsNullOrWhiteSpace([string]$Contents)) { continue }
        $Match = [regex]::Match([string]$Contents, "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($Match.Success) { return $Match.Value }
      }
    }
    Start-Sleep -Milliseconds 500
  }
  $TunnelError = Join-Path $RuntimeDir "cloudflared-error.log"
  if (Test-Path $TunnelError) {
    $ErrorLines = Get-Content -LiteralPath $TunnelError -Tail 30 -ErrorAction SilentlyContinue
    if ($ErrorLines) {
      Write-Host ""
      Write-Host "[DETALLE DE CLOUDFLARE]" -ForegroundColor Yellow
      $ErrorLines | ForEach-Object { Write-Host $_ -ForegroundColor DarkYellow }
      Write-Host ""
    }
  }
  throw "Cloudflare no entrego una URL publica. Revisa .voltkey-runtime\cloudflared-error.log."
}

try {
  Set-Location $ProjectRoot
  New-Item -ItemType Directory -Force -Path $RuntimeDir, $DataDir | Out-Null
  $Node = Require-Command "node" "Instala Node.js LTS desde https://nodejs.org/."
  $Npm = Require-Command "npm" "Node.js debe incluir npm."
  $Npx = Require-Command "npx" "Node.js debe incluir npx."
  $Python = Require-Command "python" "Instala Python 3.11 o superior y marca Add Python to PATH."
  $PythonVersionOk = & $Python -c "import sys; print(1 if sys.version_info >= (3, 11) else 0)"
  if ($LASTEXITCODE -ne 0 -or $PythonVersionOk.Trim() -ne "1") {
    throw "VoltKey requiere Python 3.11 o superior. Comprueba con: python --version"
  }

  $ExpoInstalled = Test-Path (Join-Path $ProjectRoot "node_modules\expo\package.json")
  $AudioInstalled = Test-Path (Join-Path $ProjectRoot "node_modules\expo-audio\package.json")
  if (-not $ExpoInstalled -or -not $AudioInstalled) {
    Write-VoltKey "Instalando dependencias de la aplicacion..."
    & $Npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install termino con error." }
  }

  Write-VoltKey "Comprobando dependencias del servidor..."
  & $Python -m pip install --disable-pip-version-check -r (Join-Path $ProjectRoot "servidor\requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "No se pudieron instalar las dependencias Python." }

  $TokenPath = Join-Path $RuntimeDir "token.txt"
  if (Test-Path $TokenPath) {
    $Token = (Get-Content -LiteralPath $TokenPath -Raw).Trim()
  } else {
    $Bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($Bytes)
    $Token = [Convert]::ToBase64String($Bytes).Replace("+", "-").Replace("/", "_").TrimEnd("=")
    [IO.File]::WriteAllText($TokenPath, $Token)
  }

  $env:VOLTKEY_TOKEN = $Token
  $env:VOLTKEY_DATA_DIR = $DataDir
  if (-not $env:VOLTKEY_TIMEZONE) { $env:VOLTKEY_TIMEZONE = "America/Santiago" }
  if (-not $env:VOLTKEY_SIMULATION) { $env:VOLTKEY_SIMULATION = "1" }
  if (-not $env:VOLTKEY_TARIFF_CLP) { $env:VOLTKEY_TARIFF_CLP = "280" }
  if (-not $env:VOLTKEY_ARDUINO_ENABLED) { $env:VOLTKEY_ARDUINO_ENABLED = "1" }
  if (-not $env:VOLTKEY_ARDUINO_PORT) { $env:VOLTKEY_ARDUINO_PORT = "auto" }
  if (-not $env:VOLTKEY_ARDUINO_BAUD) { $env:VOLTKEY_ARDUINO_BAUD = "115200" }
  if (-not $env:VOLTKEY_ARDUINO_REQUIRED) { $env:VOLTKEY_ARDUINO_REQUIRED = "1" }
  if (-not $env:VOLTKEY_CARD_DELAY_SECONDS) { $env:VOLTKEY_CARD_DELAY_SECONDS = "5" }

  $BackendOut = Join-Path $RuntimeDir "backend.log"
  $BackendError = Join-Path $RuntimeDir "backend-error.log"
  Write-VoltKey "Iniciando pasarela ARDUINO TEST 1.2 USB-Internet en el puerto 8000..."
  $BackendProcess = Start-Process -FilePath $Python -ArgumentList @("-m", "uvicorn", "servidor.voltkey_server:app", "--host", "127.0.0.1", "--port", "8000") -WorkingDirectory $ProjectRoot -PassThru -RedirectStandardOutput $BackendOut -RedirectStandardError $BackendError
  Start-Sleep -Milliseconds 400
  if ($BackendProcess.HasExited) { throw "Python no pudo abrir el puerto 8000. Cierra otro servidor anterior y revisa .voltkey-runtime\backend-error.log." }
  Wait-VoltKeyHealth
  Write-VoltKey "Pasarela Python: LISTA"
  if ($env:VOLTKEY_ARDUINO_ENABLED -eq "0") {
    Write-Host "[VOLTKEY] Modo sin Arduino (VOLTKEY_ARDUINO_ENABLED=0): se omite la espera del UNO R3." -ForegroundColor Yellow
    Write-Host "[VOLTKEY] La app correra en modo demo/simulacion, sin control fisico de reles." -ForegroundColor Yellow
  } else {
    Write-VoltKey "Buscando el servidor fisico Arduino UNO R3 por USB..."
    $ArduinoStatus = Wait-VoltKeyArduino
    if ($ArduinoStatus) {
      Write-Host "[VOLTKEY] Servidor Arduino UNO R3: CONECTADO en $($ArduinoStatus.port)" -ForegroundColor Green
    } else {
      throw "No se detecto el servidor Arduino UNO R3. Conectalo, carga el firmware y cierra el Monitor Serie antes de iniciar VoltKey (o inicia con VOLTKEY_ARDUINO_ENABLED=0 para modo sin Arduino)."
    }
  }

  if ($SinTunnelBackend) {
    $PublicUrl = "http://127.0.0.1:8000"
    $WsUrl = "ws://127.0.0.1:8000/ws"
  } else {
    $Cloudflared = Require-Command "cloudflared" "Instalalo con: winget install --id Cloudflare.cloudflared"
    $TunnelOut = Join-Path $RuntimeDir "cloudflared.log"
    $TunnelError = Join-Path $RuntimeDir "cloudflared-error.log"
    Remove-Item -LiteralPath $TunnelOut, $TunnelError -Force -ErrorAction SilentlyContinue
    Write-VoltKey "Creando tunel seguro para la sincronizacion..."
    $TunnelProcess = Start-Process -FilePath $Cloudflared -ArgumentList @("tunnel", "--url", "http://127.0.0.1:8000", "--no-autoupdate") -WorkingDirectory $ProjectRoot -PassThru -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelError
    $PublicUrl = Find-TunnelUrl -LogPaths @($TunnelOut, $TunnelError)
    $WsUrl = $PublicUrl.Replace("https://", "wss://") + "/ws"
  }

  $EnvLines = @(
    "# Generado automaticamente por Iniciar-VoltKey.cmd",
    "EXPO_PUBLIC_WS_URL=$WsUrl",
    "EXPO_PUBLIC_API_URL=$PublicUrl",
    "EXPO_PUBLIC_VOLTKEY_TOKEN=$Token"
  )
  [IO.File]::WriteAllLines((Join-Path $ProjectRoot ".env"), $EnvLines)
  Write-VoltKey "Sincronizacion publica: $PublicUrl"
  Write-VoltKey "Abre Expo Go y escanea el QR de VoltKey ARDUINO TEST 1.2. La interfaz del computador se abrira en el navegador."
  Write-VoltKey "Mantiene esta ventana abierta. Ctrl+C detiene todo el sistema."

  $ExpoArguments = @("expo", "start", "--tunnel", "--clear")
  if (-not $SinWeb) { $ExpoArguments += "--web" }
  & $Npx @ExpoArguments
} catch {
  Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Los registros se encuentran en .voltkey-runtime." -ForegroundColor Yellow
  Read-Host "Presiona Enter para cerrar"
  exit 1
} finally {
  foreach ($Process in @($TunnelProcess, $BackendProcess)) {
    if ($Process -and -not $Process.HasExited) {
      Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
  }
}
