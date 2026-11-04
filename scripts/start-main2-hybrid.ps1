# Main-2 official local entrypoint: 5173 hybrid, 8083 hybrid alternate, 5174 Vite.
# Example: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -BindIp 192.168.1.26
# Revert:  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -Action rollback
[CmdletBinding()]
param(
    [ValidateSet('up', 'status', 'rollback')]
    [string]$Action = 'up',
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
$keys = @('FRONTEND_HOST_PORT', 'FRONTEND_BIND_IP', 'NUXT_LOCAL_GATEWAY_BIND_IP', 'NUXT_LOCAL_GATEWAY_PORT', 'NUXT_MAIN2_PORT')
$original = @{}
foreach ($key in $keys) {
    $item = Get-Item -Path "Env:$key" -ErrorAction SilentlyContinue
    $original[$key] = if ($null -eq $item) { $null } else { $item.Value }
}
function Restore-HybridEnvironment {
    foreach ($key in $keys) {
        if ($null -eq $original[$key]) {
            Remove-Item -Path "Env:$key" -ErrorAction SilentlyContinue
        } else {
            Set-Item -Path "Env:$key" -Value $original[$key]
        }
    }
}
function Invoke-Compose {
    param([string[]]$Arguments)
    & docker compose @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose terminó con código $LASTEXITCODE. No se han borrado volúmenes."
    }
}
Push-Location $root
try {
    if (!(Test-Path '.env')) { throw 'Falta .env. Ejecutá primero scripts/setup-docker.ps1 (sin sobrescribir tu .env actual).' }
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'No se encontró Docker en PATH.' }

    $parsedIp = $null
    if (-not [System.Net.IPAddress]::TryParse($BindIp, [ref]$parsedIp) -or
        $parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
        $BindIp -eq '0.0.0.0') {
        throw 'Indicá 127.0.0.1 o una IP IPv4 concreta de tu computadora. No se permite 0.0.0.0.'
    }
    if ($Action -eq 'up' -and $BindIp -ne '127.0.0.1') {
        $localIps = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Select-Object -ExpandProperty IPAddress)
        if ($localIps -notcontains $BindIp) {
            throw "La IP $BindIp no está asignada a esta computadora. Revisá ipconfig."
        }
    }
    $env:FRONTEND_HOST_PORT = '5174'
    $env:FRONTEND_BIND_IP = '127.0.0.1'
    $env:NUXT_LOCAL_GATEWAY_BIND_IP = $BindIp
    $env:NUXT_LOCAL_GATEWAY_PORT = '8083'
    $env:NUXT_MAIN2_PORT = '5173'

    switch ($Action) {
        'status' {
            Invoke-Compose -Arguments ($files + @('ps'))
        }
        'rollback' {
            # Stopping only the gateway frees port 5173; databases and backend stay intact.
            Invoke-Compose -Arguments ($files + @('stop', 'nuxt-local-gateway'))
            Restore-HybridEnvironment
            Invoke-Compose -Arguments @('-f', 'compose.yaml', 'up', '-d', '--no-deps', '--force-recreate', 'frontend')
            Write-Host 'Vue/Vite original restaurado. Se conservaron los volúmenes y el backend.'
        }
        'up' {
            Invoke-Compose -Arguments ($files + @('config', '--quiet'))
            # Release the old Vite host port FIRST, before starting gateway on 5173.
            Invoke-Compose -Arguments ($files + @('up', '-d', '--build', 'frontend'))
            Invoke-Compose -Arguments ($files + @('up', '-d', '--build', 'backend', 'frontend-nuxt', 'frontend-legacy-preview', 'nuxt-local-gateway'))
            Invoke-Compose -Arguments ($files + @('ps'))

            $probeIp = if ($BindIp -eq '127.0.0.1') { '127.0.0.1' } else { $BindIp }
            $publicUrl = "http://$($probeIp):5173/servicios/transporte-maritimo"
            $loginUrl = "http://$($probeIp):5173/bienvenidos"
            $ready = $false
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                try {
                    $public = Invoke-WebRequest -Uri $publicUrl -UseBasicParsing -TimeoutSec 8
                    $private = Invoke-WebRequest -Uri $loginUrl -UseBasicParsing -TimeoutSec 8
                    if ($public.StatusCode -eq 200 -and $public.Content -match 'service-landing-page' -and
                        $private.StatusCode -eq 200 -and $private.Content -match 'id="app"') {
                        $ready = $true
                        break
                    }
                } catch {
                    # Services may still be starting; report failure if final attempt also fails.
                }
                Start-Sleep -Seconds 2
            }
            if (-not $ready) {
                throw 'El gateway arrancó, pero no pasó el smoke HTTP de Servicios/Login. Revisá docker compose logs; no se hizo rollback automático.'
            }
            Write-Host "Híbrido principal: http://$($probeIp):5173/"
            Write-Host "Híbrido alternativo: http://$($probeIp):8083/"
            Write-Host 'Vue/Vite para desarrollo: http://127.0.0.1:5174/'
            Write-Host 'Solo está disponible en las interfaces que seleccionaste; mantené el firewall restringido a la LAN.'
        }
    }
} finally {
    Restore-HybridEnvironment
    Pop-Location
}
