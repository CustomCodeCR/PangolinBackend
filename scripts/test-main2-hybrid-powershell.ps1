# Regression for Windows PowerShell 5.1; Docker and HTTP are mocked.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'start-main2-hybrid.ps1'
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile($launcher, [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) {
    throw "El lanzador no se puede analizar en PowerShell 5.1: $($errors | Out-String)"
}
$source = Get-Content -Raw -Path $launcher
if ($source.Contains('compose @files ps -q')) {
    throw 'Se reintrodujo la consulta Compose ps -q que fallaba en Docker Desktop.'
}
$testEnv = Join-Path $root '.env'
if (Test-Path $testEnv) { throw 'La prueba simulada no debe ejecutarse con .env existente.' }
$script:dockerCalls = @()
function docker {
    param([Parameter(ValueFromRemainingArguments=$true)][string[]]$DockerArgs)
    $global:LASTEXITCODE = 0
    $script:dockerCalls += ,@($DockerArgs)
    if ($DockerArgs.Count -gt 0 -and $DockerArgs[0] -eq 'ps') {
        $filterText = $DockerArgs -join ' '
        if ($filterText.Contains('service=nuxt-main2-gateway')) { return 'fake-main2-id' }
        if ($filterText.Contains('service=nuxt-local-gateway')) { return 'fake-alternate-id' }
    }
    if ($DockerArgs.Count -gt 0 -and $DockerArgs[0] -eq 'inspect') {
        if ($DockerArgs[-1] -eq 'fake-main2-id') {
            return '{"80/tcp":[{"HostIp":"127.0.0.1","HostPort":"5173"}]}'
        }
        if ($DockerArgs[-1] -eq 'fake-alternate-id') {
            return '{"80/tcp":[{"HostIp":"127.0.0.1","HostPort":"8083"}]}'
        }
    }
    throw "Llamada Docker inesperada en verificación: $($DockerArgs -join ' ')"
}
function Invoke-WebRequest {
    param([string]$Uri, [switch]$UseBasicParsing, [int]$TimeoutSec)
    if ($Uri -match '/bienvenidos$') {
        return [pscustomobject]@{ StatusCode = 200; Content = '<html><div id="app"></div></html>' }
    }
    if ($Uri -match '/servicios/transporte-maritimo$') {
        return [pscustomobject]@{ StatusCode = 200; Content = '<html><main class="service-landing-page"></main></html>' }
    }
    throw "URL inesperada: $Uri"
}
try {
    Set-Content -Path $testEnv -Value '# Test fixture sin secretos.' -Encoding UTF8
    & $launcher -Action verify -BindIp '127.0.0.1'
    if ($script:dockerCalls.Count -ne 4) {
        throw "Esperábamos dos consultas Docker ps y dos inspect, recibimos $($script:dockerCalls.Count)."
    }
    foreach ($call in $script:dockerCalls) {
        if ($call -contains 'up' -or $call -contains 'stop' -or $call -contains 'rm' -or $call -contains 'restart') {
            throw "La verificación intentó modificar contenedores: $($call -join ' ')"
        }
    }
    Write-Host 'PASS Windows PowerShell 5.1: verificación sin reconstruir Docker.'
} finally {
    Remove-Item -Path $testEnv -ErrorAction SilentlyContinue
}
