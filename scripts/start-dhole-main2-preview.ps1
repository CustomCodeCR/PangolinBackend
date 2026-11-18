# Enables Dhole ONLY in your local hybrid Docker (not in main-2 / production).
# Existing databases, Docker named volumes and other Compose projects are kept.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-dhole-main2-preview.ps1 -BindIp 192.168.1.26
[CmdletBinding()]
param(
    [string]$BindIp = '127.0.0.1'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$files = @(
    '-f', 'compose.yaml',
    '-f', 'compose.nuxt-preview.yaml',
    '-f', 'compose.nuxt-local-hybrid.yaml',
    '-f', 'compose.main2-hybrid.yaml'
)
$originalKey = Get-Item 'Env:DHOLE_LOCAL_PREVIEW_KEY' -ErrorAction SilentlyContinue
$oldValue = if ($null -eq $originalKey) { $null } else { $originalKey.Value }
$backendPreviewStarted = $false
Push-Location $root
try {
    if (!(Test-Path '.env')) {
        throw 'Falta el .env del Docker local. No copies claves ni archivos .env en GitHub.'
    }
    Write-Host 'Actualizando gateway hibrido local desde esta rama (5173 y 8083)...'
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-main2-hybrid.ps1') -Action up -BindIp $BindIp
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar el gateway hibrido local.' }

    # Prefer a key stored in this gitignored local .env, so users do not
    # repeatedly paste it. An environment variable takes precedence.
    $savedKey = $oldValue
    if ([string]::IsNullOrWhiteSpace($savedKey)) {
        foreach ($entry in [System.IO.File]::ReadLines((Resolve-Path '.env').Path)) {
            if ($entry -match '^\s*DHOLE_LOCAL_PREVIEW_KEY\s*=\s*(.*?)\s*$') {
                $savedKey = $Matches[1].Trim()
                if ($savedKey.Length -ge 2 -and
                    (($savedKey.StartsWith("'") -and $savedKey.EndsWith("'")) -or
                     ($savedKey.StartsWith('"') -and $savedKey.EndsWith('"')))) {
                    $savedKey = $savedKey.Substring(1, $savedKey.Length - 2)
                }
            }
        }
    }
    if (-not [string]::IsNullOrWhiteSpace($savedKey)) {
        $env:DHOLE_LOCAL_PREVIEW_KEY = $savedKey
        Write-Host 'Clave Dhole cargada desde configuracion local (valor oculto).'
    } else {
        Write-Host 'DHOLE_LOCAL_PREVIEW_KEY no esta en .env. Se solicitara solo para esta ejecucion.'
        $secure = Read-Host 'API Key Dhole para vista previa LOCAL (oculta al escribir)' -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
            if ([string]::IsNullOrWhiteSpace($key)) { throw 'La API Key esta vacia.' }
            $env:DHOLE_LOCAL_PREVIEW_KEY = $key
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
            $key = $null
            $secure.Dispose()
        }
    }
    $savedKey = $null
    Write-Host 'Activando opciones Dhole solo en el backend Docker de desarrollo...'
    # A failed Compose command may partially recreate the container; always
    # attempt to restore the normal backend if this call was started.
    $backendPreviewStarted = $true
    & docker compose @files -f compose.dhole-main2-preview.yaml up -d --no-deps --force-recreate backend
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo activar Dhole en el backend local.' }

    $ready = $false
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        try {
            $uri = "http://$($BindIp):5173/api/quotes/official/dhole-options?mode=Maritime&shipmentType=FCL"
            $options = Invoke-RestMethod -Uri $uri -TimeoutSec 15 -Method Get
            if ($options.source -eq 'dhole' -and
                @($options.origins).Count -gt 0 -and
                @($options.destinations).Count -gt 0) {
                $ready = $true
                break
            }
        } catch {
            # The backend may be starting, or the real API may be temporarily down.
            # Do not echo a response that could contain provider details.
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) {
        throw 'El backend no obtuvo opciones Dhole. Verifica la clave y la conectividad; no se activara una vista previa incompleta.'
    }
    Write-Host ''
    Write-Host 'VISTA PREVIA DHOLE HABILITADA SOLO EN DOCKER LOCAL.'
    Write-Host "Cotizaciones: http://$($BindIp):5173/cotizaciones"
    Write-Host "Itinerarios:  http://$($BindIp):5173/itinerario"
    Write-Host "Gateway alterno: http://$($BindIp):8083/cotizaciones"
    Write-Host 'No se ha desplegado nada en GitHub main-2 ni en produccion.'
    Write-Host 'No pulses Enviar solicitud para pruebas visuales: enviaria datos a tu base LOCAL.'
    Write-Host 'Para desactivar Dhole, ejecuta de nuevo start-main2-hybrid.ps1 -Action up con la misma IP.'
} catch {
    if ($backendPreviewStarted) {
        Write-Warning 'Fallaron las verificaciones. Restaurando el backend sin Dhole.'
        try {
            & docker compose @files up -d --no-deps --force-recreate backend
            if ($LASTEXITCODE -ne 0) {
                Write-Warning 'El backend no se restauro automaticamente. Ejecuta start-main2-hybrid.ps1 -Action up.'
            }
        } catch {
            Write-Warning 'El backend no se restauro automaticamente. Ejecuta start-main2-hybrid.ps1 -Action up.'
        }
    }
    throw
} finally {
    if ($null -eq $oldValue) {
        Remove-Item 'Env:DHOLE_LOCAL_PREVIEW_KEY' -ErrorAction SilentlyContinue
    } else {
        Set-Item 'Env:DHOLE_LOCAL_PREVIEW_KEY' -Value $oldValue
    }
    Pop-Location
}
