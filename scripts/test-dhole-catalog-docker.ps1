#requires -Version 5.1
<#
.SYNOPSIS
  One-shot Docker smoke test for the seven Dhole GET catalogue endpoints.
.DESCRIPTION
  Builds an isolated backend-only container, probes the seven GET APIs, stops
  the container and deletes the temporary environment file. No DB, app schema,
  production compose, frontend or POST is used.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$compose = Join-Path $repoRoot 'compose.dhole-catalog-smoke.yaml'
$envFile = Join-Path $repoRoot '.env.dhole-catalog-smoke'
$project = 'cf-dhole-catalog-smoke'
$createdEnvFile = $false
$composeStarted = $false

function New-SafeHex([int]$count) {
    $bytes = New-Object byte[] $count
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
        return ([System.BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    } finally {
        $rng.Dispose()
    }
}

Push-Location $repoRoot
try {
    if (-not (Test-Path -LiteralPath $compose)) {
        throw 'No existe el compose de prueba. Actualizá la rama de Dhole.'
    }
    $branch = (& git branch --show-current)
    if ($LASTEXITCODE -ne 0 -or $branch.Trim() -ne 'feat/dhole-catalog-backend-20261117') {
        throw 'Por seguridad, ejecutá la prueba desde la rama feat/dhole-catalog-backend-20261117.'
    }
    & docker compose version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker Compose no está disponible. Verificá Docker Desktop.'
    }
    if (Test-Path -LiteralPath $envFile) {
        throw 'Existe un archivo privado anterior de prueba. No será reemplazado ni eliminado.'
    }

    Write-Host 'Prueba local aislada: únicamente GET, puerto 127.0.0.1:5517, sin base de datos ni frontend.'
    $secureKey = Read-Host 'Pegá aquí la API Key de catálogos Dhole (se oculta al escribir)' -AsSecureString
    $pointer = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        $apiKey = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
        $secureKey.Dispose()
    }
    if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey -match '[\r\n]') {
        throw 'Clave vacía o con saltos de línea. No se inició Docker.'
    }

    # No registrar secretos en terminal ni pasarlos en la línea de comandos Docker.
    $lines = @(
        ('Auth__OtpPepper=' + (New-SafeHex 32)),
        ('Auth__JwtSigningKey=' + (New-SafeHex 32)),
        'DholeCatalogs__Enabled=true',
        # Activated ONLY inside the short-lived localhost-only smoke container.
        'DholeCatalogs__FormEnabled=true',
        'DholeCatalogs__SubmissionEnabled=true',
        'DholeCatalogs__ItinerariesEnabled=true',
        ('DholeCatalogs__ApiKey=' + $apiKey)
    )
    $createdEnvFile = $true
    [System.IO.File]::WriteAllLines($envFile, $lines, ([System.Text.UTF8Encoding]::new($false)))
    $apiKey = $null
    $lines = $null

    Write-Host 'Construyendo un backend de pruebas independiente...'
    $composeStarted = $true
    & docker compose -p $project -f $compose up -d --build backend
    if ($LASTEXITCODE -ne 0) { throw 'Docker Compose no pudo iniciar el backend de prueba.' }

    $base = 'http://127.0.0.1:5517'
    $healthy = $false
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        try {
            $health = Invoke-RestMethod -Uri "$base/api/health" -Method Get -TimeoutSec 3
            if ($health.status -eq 'ok') {
                $healthy = $true
                break
            }
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if (-not $healthy) { throw 'Backend de prueba no respondió en http://127.0.0.1:5517.' }

    $catalogs = @(
        'incoterms',
        'pod',
        'poe',
        'pol',
        'container-sizes',
        'container-types',
        'truck-sizes'
    )
    $summary = @()
    foreach ($catalog in $catalogs) {
        $result = Invoke-RestMethod -Uri "$base/api/dhole/catalogs/$catalog" -Method Get -TimeoutSec 40
        $count = @($result.items).Count
        if ($result.catalog -ne $catalog -or $count -lt 1 -or $result.stale -eq $true) {
            throw "Catálogo ${catalog}: respuesta inesperada o datos no actualizados."
        }
        $summary += [PSCustomObject]@{
            Catalogo = $catalog
            Registros = $count
            Stale = $result.stale
        }
    }

    Write-Host ''
    Write-Host '=== 7 CATÁLOGOS CONSULTADOS POR EL BACKEND DOCKER ==='
    $summary | Format-Table -AutoSize

    # Next level: check the ACTUAL server-side role/modality and equipment
    # projection, not just the raw seven API counts.
    $forms = @(
        @{ Mode='Maritime'; Shipment='FCL' },
        @{ Mode='Maritime'; Shipment='LCL' },
        @{ Mode='Air'; Shipment='AIR_LCL' },
        @{ Mode='Land'; Shipment='FTL' },
        @{ Mode='Land'; Shipment='LTL' }
    )
    $formSummary = @()
    foreach ($spec in $forms) {
        $url = "$base/api/quotes/official/dhole-options?mode=$($spec.Mode)&shipmentType=$($spec.Shipment)"
        $options = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 40
        $origins = @($options.origins | Where-Object { $null -ne $_ }).Count
        $destinations = @($options.destinations | Where-Object { $null -ne $_ }).Count
        $pods = @($options.pods | Where-Object { $null -ne $_ }).Count
        $sizes = @($options.equipmentSizes | Where-Object { $null -ne $_ }).Count
        if ($options.source -ne 'dhole' -or
            $options.mode -ne $spec.Mode -or
            $options.shipmentType -ne $spec.Shipment -or
            $origins -lt 1 -or $destinations -lt 1 -or
            ($spec.Shipment -eq 'LCL' -and $pods -lt 1) -or
            (($spec.Shipment -eq 'FCL' -or $spec.Shipment -eq 'FTL') -and $sizes -lt 1)) {
            throw "Proyección incompleta: $($spec.Mode) / $($spec.Shipment)."
        }
        $formSummary += [PSCustomObject]@{
            Modalidad = $spec.Mode
            Embarque = $spec.Shipment
            Origenes = $origins
            Destinos = $destinations
            POD = $pods
            Tamanos = $sizes
        }
    }
    Write-Host ''
    Write-Host '=== 5 MODALIDADES DE COTIZACIÓN, PROYECCIÓN REAL ==='
    $formSummary | Format-Table -AutoSize

    # Itinerarios uses POL/POD, never substitute POE for POD.
    $routeSummary = @()
    foreach ($transport in @('maritime','ground','all')) {
        foreach ($role in @('origin','destination')) {
            $url = "$base/api/itinerarios/locations?transport=$transport&routeRole=$role"
            $result = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 40
            $count = @($result.items | Where-Object { $null -ne $_ }).Count
            if ($result.source -ne 'dhole' -or $count -lt 1) {
                throw "Itinerarios: proyección vacía para ${transport}/${role}."
            }
            $routeSummary += [PSCustomObject]@{
                Transporte = $transport
                Campo = $role
                Registros = $count
            }
        }
    }
    Write-Host ''
    Write-Host '=== FILTROS DE ITINERARIOS CON POL / POD REALES ==='
    $routeSummary | Format-Table -AutoSize
    Write-Host 'RESULTADO: siete catálogos GET, cinco variantes de cotización y seis filtros de itinerario comprobados. Sin POST.'

} catch {
    Write-Warning $_.Exception.Message
    if ($composeStarted) {
        Write-Host '=== ÚLTIMAS LÍNEAS DEL BACKEND DE PRUEBA (sin secretos) ==='
        & docker compose -p $project -f $compose logs --tail 35 backend
    }
    throw
} finally {
    if ($composeStarted) {
        Write-Host 'Deteniendo y retirando exclusivamente el proyecto Docker de prueba...'
        & docker compose -p $project -f $compose down --remove-orphans | Out-Null
    }
    if ($createdEnvFile -and (Test-Path -LiteralPath $envFile)) {
        Remove-Item -LiteralPath $envFile -Force
        Write-Host 'Archivo temporal de claves eliminado.'
    }
    Pop-Location
}
