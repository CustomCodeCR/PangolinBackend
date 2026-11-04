# Main-2 official local entrypoint: 5173 hybrid, 8083 hybrid alternate, 5174 Vite.
# Example: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -BindIp 192.168.1.26
# Revert:  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-main2-hybrid.ps1 -Action rollback
[CmdletBinding()]
param(
    [ValidateSet('up', 'status', 'verify', 'rollback')]
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

function Assert-GatewayBindings {
    param([string]$BindIp)
    foreach ($gateway in @(
        @{ Name = 'nuxt-main2-gateway'; Port = '5173' },
        @{ Name = 'nuxt-local-gateway'; Port = '8083' }
    )) {
        $serviceName = [string]$gateway['Name']
        $expectedPort = [string]$gateway['Port']
        # Use docker ps directly (which already works in Windows logs), not
        # 'docker compose ps -q', which may return no ID after 'up' on Windows.
        $ids = @(& docker ps --filter 'label=com.docker.compose.project=castrofallas' --filter "label=com.docker.compose.service=$serviceName" --format '{{.ID}}')
        if ($LASTEXITCODE -ne 0 -or $ids.Count -ne 1 -or [string]::IsNullOrWhiteSpace([string]$ids[0])) {
            throw "No hay exactamente un contenedor activo para $serviceName. Verificá docker ps."
        }
        $publishedJson = & docker inspect --format '{{json .NetworkSettings.Ports}}' ([string]$ids[0])
        if ($LASTEXITCODE -ne 0) { throw "No se pudieron consultar los puertos de $serviceName." }
        $published = $publishedJson | ConvertFrom-Json
        $actualPorts = @($published.'80/tcp')
        $matchingPorts = @($actualPorts | Where-Object {
            [string]$_.HostIp -eq $BindIp -and [string]$_.HostPort -eq $expectedPort
        })
        if ($actualPorts.Count -ne 1 -or $matchingPorts.Count -ne 1) {
            throw "El gateway $serviceName no publicó $($BindIp):$expectedPort. Revisá docker ps."
        }
    }
    Write-Host 'Puertos reales comprobados: 5173 y 8083.'
}
function Assert-GatewayHttp {
    param([string]$BindIp, [int]$Attempts = 1)
    foreach ($port in @(5173, 8083)) {
        $ready = $false
        for ($attempt = 0; $attempt -lt $Attempts; $attempt++) {
            try {
                $public = Invoke-WebRequest -Uri "http://$($BindIp):$port/servicios/transporte-maritimo" -UseBasicParsing -TimeoutSec 8
                $login = Invoke-WebRequest -Uri "http://$($BindIp):$port/bienvenidos" -UseBasicParsing -TimeoutSec 8
                if ($public.StatusCode -eq 200 -and $public.Content -match 'service-landing-page' -and
                    $login.StatusCode -eq 200 -and $login.Content -match 'id="app"') {
                    $ready = $true
                    break
                }
            } catch {
                # Newly recreated services may need a moment before serving HTTP.
            }
            if ($attempt + 1 -lt $Attempts) { Start-Sleep -Seconds 2 }
        }
        if (-not $ready) {
            throw "El puerto $port está publicado, pero Servicios o Login no respondió correctamente."
        }
    }
    Write-Host 'HTTP verificado: Servicios y Login en 5173 y 8083.'
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
        'verify' {
            # READ-ONLY: no Docker builds, restarts, stops or volume changes.
            Assert-GatewayBindings -BindIp $BindIp
            Assert-GatewayHttp -BindIp $BindIp -Attempts 1
            Write-Host 'Verificación completada sin reconstruir ni reiniciar Docker.'
        }
        'rollback' {
            # Stopping only the gateway frees port 5173; databases and backend stay intact.
            Invoke-Compose -Arguments ($files + @('stop', 'nuxt-main2-gateway', 'nuxt-local-gateway'))
            Restore-HybridEnvironment
            Invoke-Compose -Arguments @('-f', 'compose.yaml', 'up', '-d', '--no-deps', '--force-recreate', 'frontend')
            Write-Host 'Vue/Vite original restaurado. Se conservaron los volúmenes y el backend.'
        }
        'up' {
            Invoke-Compose -Arguments ($files + @('config', '--quiet'))
            # Compare the planned port bindings before touching running services.
            # The Compose JSON stays in memory: it may contain private environment values.
            $composeJson = & docker compose @files config --format json
            if ($LASTEXITCODE -ne 0) { throw 'No se pudo inspeccionar la configuración Compose.' }
            $composeConfig = $composeJson | ConvertFrom-Json
            $gatewayMap = @(
                @{ Name = 'nuxt-main2-gateway'; Port = '5173' },
                @{ Name = 'nuxt-local-gateway'; Port = '8083' }
            )
            foreach ($gateway in $gatewayMap) {
                $expectedPorts = @($composeConfig.services.PSObject.Properties[$gateway.Name].Value.ports)
                $matches = @($expectedPorts | Where-Object {
                    [string]$_.published -eq $gateway.Port -and
                    [string]$_.host_ip -eq $BindIp -and [int]$_.target -eq 80
                })
                if ($matches.Count -ne 1 -or $expectedPorts.Count -ne 1) {
                    throw "El servicio $($gateway.Name) no tiene exactamente una publicación $($BindIp):$($gateway.Port)."
                }
            }
            # Release the old Vite host port FIRST, before starting gateway on 5173.
            Invoke-Compose -Arguments ($files + @('up', '-d', '--build', 'frontend'))
            Invoke-Compose -Arguments ($files + @('up', '-d', '--build', 'backend', 'frontend-nuxt', 'frontend-legacy-preview'))
            # Existing gateway may be stopped but still retain old no-port bindings.
            # Recreate JUST nginx, without dependencies or volumes, to apply port mappings.
            Invoke-Compose -Arguments ($files + @('up', '-d', '--no-deps', '--force-recreate', 'nuxt-local-gateway', 'nuxt-main2-gateway'))
            Invoke-Compose -Arguments ($files + @('ps'))
            Assert-GatewayBindings -BindIp $BindIp
            Assert-GatewayHttp -BindIp $BindIp -Attempts 30
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
