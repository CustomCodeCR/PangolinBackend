# Compatibility launcher for the Dhole local preview.
# start-main2-hybrid.ps1 now activates Dhole automatically when .env contains
# DHOLE_LOCAL_PREVIEW_KEY. This wrapper can still prompt if no key is saved.
# No production deployments or other Docker Compose projects are changed.
[CmdletBinding()]
param(
    [string]$BindIp = '127.0.0.1'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$originalKey = Get-Item 'Env:DHOLE_LOCAL_PREVIEW_KEY' -ErrorAction SilentlyContinue
$oldValue = if ($null -eq $originalKey) { $null } else { $originalKey.Value }
Push-Location $root
try {
    if (!(Test-Path '.env')) {
        throw 'Falta .env del Docker local. No copies claves ni archivos .env en GitHub.'
    }

    # The main hybrid launcher handles persistent .env and automatically
    # selects the Dhole overlay. Keep the prompt for old callers without .env.
    $keyPresent = -not [string]::IsNullOrWhiteSpace($oldValue)
    if (-not $keyPresent) {
        foreach ($line in [System.IO.File]::ReadLines((Resolve-Path '.env').Path)) {
            if ($line -match '^\s*DHOLE_LOCAL_PREVIEW_KEY\s*=\s*(.*?)\s*$') {
                $value = $Matches[1].Trim()
                if ($value.Length -ge 2 -and
                    (($value.StartsWith("'") -and $value.EndsWith("'")) -or
                     ($value.StartsWith('"') -and $value.EndsWith('"')))) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
                $keyPresent = -not [string]::IsNullOrWhiteSpace($value)
                $value = $null
            }
        }
    }
    if (-not $keyPresent) {
        $secure = Read-Host 'API Key Dhole para vista previa LOCAL (oculta)' -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
            if ([string]::IsNullOrWhiteSpace($key)) {
                throw 'La API Key de Dhole esta vacia.'
            }
            $env:DHOLE_LOCAL_PREVIEW_KEY = $key
            $key = $null
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
            $secure.Dispose()
        }
    }

    # Do not start hybrid twice: the standard launcher now enables all Dhole
    # flags only for this local Compose project if a key is configured.
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'start-main2-hybrid.ps1') -Action up -BindIp $BindIp
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo iniciar el Docker local con Dhole.'
    }

    $ready = $false
    for ($attempt = 0; $attempt -lt 25; $attempt++) {
        try {
            $uri = "http://$($BindIp):5173/api/quotes/official/dhole-options?mode=Maritime&shipmentType=FCL"
            $options = Invoke-RestMethod -Uri $uri -TimeoutSec 15 -Method Get
            if ($options.source -eq 'dhole' -and
                @($options.origins).Count -gt 0 -and
                @($options.destinations).Count -gt 0 -and
                @($options.pods).Count -gt 0) {
                $ready = $true
                break
            }
        } catch {
            # Never reveal details or credentials supplied by the backend.
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) {
        throw 'Dhole no devolvio opciones de cotizacion validas; verifica la clave y la conectividad.'
    }
    Write-Host ''
    Write-Host "Dhole habilitado en tu Docker local: http://$($BindIp):5173/cotizaciones"
    Write-Host 'No se altero main-2 remoto ni produccion.'
} finally {
    if ($null -eq $oldValue) {
        Remove-Item 'Env:DHOLE_LOCAL_PREVIEW_KEY' -ErrorAction SilentlyContinue
    } else {
        Set-Item 'Env:DHOLE_LOCAL_PREVIEW_KEY' -Value $oldValue
    }
    Pop-Location
}
