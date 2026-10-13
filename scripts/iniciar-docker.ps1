# Windows / Docker Desktop: iniciar todo y comprobar la conexion REAL a PostgreSQL.
# Se puede ejecutar desde cualquier carpeta. Preserva .env y volumenes existentes.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker no esta instalado o no figura en PATH. Instala / inicia Docker Desktop.'
}

& (Join-Path $PSScriptRoot 'setup-docker.ps1')

$composeArgs = @('compose', '--project-directory', $root, '-f', (Join-Path $root 'compose.yaml'))
& docker @composeArgs config --quiet
if ($LASTEXITCODE -ne 0) { throw 'compose.yaml o el .env contienen algun error.' }

& docker @composeArgs up -d --build
if ($LASTEXITCODE -ne 0) { throw 'Docker no pudo iniciar los servicios. Verifica Docker Desktop y los logs.' }

$backendPort = 5000
foreach ($line in [System.IO.File]::ReadAllLines((Join-Path $root '.env'))) {
    if ($line -match '^\s*BACKEND_HOST_PORT\s*=\s*(\d+)\s*$') {
        $backendPort = [int]$Matches[1]
    }
}
$url = "http://127.0.0.1:$backendPort/api/health/ready"
$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
        if ($response.StatusCode -eq 200 -and ($response.Content | ConvertFrom-Json).status -eq 'ready') {
            $ready = $true
            break
        }
    } catch {
        # Durante el inicio .NET puede estar arrancando o postgres inicializandose.
    }
    Start-Sleep -Seconds 2
}
& docker @composeArgs ps
if (-not $ready) {
    Write-Host "La API no confirmo PostgreSQL en $url. Comprueba:" -ForegroundColor Yellow
    Write-Host 'docker compose logs --tail=100 postgres backend'
    throw 'No se pudo confirmar la conexion a la base de datos. NO uses docker compose down -v.'
}
Write-Host "OK: API y PostgreSQL conectados ($url)." -ForegroundColor Green
Write-Host 'Sitio: http://127.0.0.1:5173 (o FRONTEND_HOST_PORT de .env).'
Write-Host 'Los servicios reinician con Docker Desktop, siempre que esten en ejecucion al apagarlo.'
