# Configure LOCAL main-2 auto-send in gitignored .env. Never performs a POST,
# launches containers, prints secrets or touches production.
[CmdletBinding()]
param([ValidateSet('enable', 'disable', 'status')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$path = Join-Path $root '.env'
if (-not (Test-Path -LiteralPath $path)) {
    throw 'Falta el .env local existente. No se creara otro ni se sobrescribiran secretos.'
}
& git -C $root check-ignore -q -- .env
if ($LASTEXITCODE -ne 0) {
    throw 'El .env no esta protegido por .gitignore; se cancela.'
}
$utf8 = New-Object System.Text.UTF8Encoding($false)
$lines = New-Object 'System.Collections.Generic.List[string]'
foreach ($line in [IO.File]::ReadAllLines($path, [Text.Encoding]::UTF8)) {
    $lines.Add($line)
}

function Find-SettingIndex([string]$name) {
    $pattern = '^\s*' + [regex]::Escape($name) + '\s*='
    $indexes = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $pattern) { $indexes += $i }
    }
    if ($indexes.Count -gt 1) {
        throw "Configuracion repetida en .env: $name. Revisala manualmente."
    }
    if ($indexes.Count -eq 1) { return [int]$indexes[0] }
    return -1
}

function Get-Setting([string]$name) {
    $idx = Find-SettingIndex $name
    if ($idx -lt 0) { return '' }
    $value = ($lines[$idx] -split '=', 2)[1].Trim()
    if ($value.Length -ge 2 -and
        (($value.StartsWith("'") -and $value.EndsWith("'")) -or
         ($value.StartsWith('"') -and $value.EndsWith('"')))) {
        $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
}

function Set-Setting([string]$name, [string]$value) {
    $idx = Find-SettingIndex $name
    if ($idx -lt 0) { $lines.Add("$name=$value") }
    else { $lines[$idx] = "$name=$value" }
}

function Test-UtcCutoff([string]$text) {
    $parsed = [DateTimeOffset]::MinValue
    $valid = [DateTimeOffset]::TryParseExact(
        $text, "yyyy-MM-dd'T'HH:mm:ss'Z'",
        [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::AssumeUniversal,
        [ref]$parsed)
    return ($valid -and $parsed.Offset -eq [TimeSpan]::Zero -and
        $parsed.UtcDateTime -le [DateTime]::UtcNow)
}

$oldFlag = Get-Setting 'DHOLE_MAIN2_AUTOSEND_ENABLED'
if ($oldFlag -notin @('', 'true', 'false')) {
    throw 'Bandera DHOLE_MAIN2_AUTOSEND_ENABLED invalida.'
}
if ($Action -eq 'status') {
    $status = if ($oldFlag -eq 'true') { 'CONFIGURADO EN .env' } else { 'DESACTIVADO EN .env' }
    Write-Host "Envio automatico local: $status"
    Write-Host 'Este comando NO verifica el contenedor en ejecucion.'
    if ($oldFlag -eq 'true') {
        Write-Host "Corte UTC: $(Get-Setting 'DHOLE_MAIN2_AUTOSEND_START_UTC')"
    }
    exit 0
}

if ($Action -eq 'enable') {
    foreach ($required in @('DHOLE_LOCAL_PREVIEW_KEY', 'GRAPH_TENANT_ID',
        'GRAPH_CLIENT_ID', 'GRAPH_CLIENT_SECRET', 'GRAPH_FROM')) {
        if ([string]::IsNullOrWhiteSpace((Get-Setting $required))) {
            throw "Falta $required en .env. No se modifica el archivo."
        }
    }
    $apiKey = Get-Setting 'DHOLE_PILOT_POST_KEY'
    if ($apiKey -cnotmatch '^dh_ext_[a-f0-9]{64}$') {
        throw 'DHOLE_PILOT_POST_KEY no tiene el formato requerido. No se modifica .env.'
    }
    $apiKey = $null
    if ($oldFlag -eq 'true') {
        $cutoff = Get-Setting 'DHOLE_MAIN2_AUTOSEND_START_UTC'
        if (-not (Test-UtcCutoff $cutoff)) {
            throw 'El corte UTC existente es invalido; no se reemplazara automaticamente.'
        }
    }
    else {
        # Re-enabling after OFF takes a NEW cutoff to exclude all work created
        # while the worker was stopped. Starting again while ON retains it.
        $cutoff = [DateTime]::UtcNow.ToString(
            "yyyy-MM-ddTHH:mm:ssZ",
            [Globalization.CultureInfo]::InvariantCulture)
        Set-Setting 'DHOLE_MAIN2_AUTOSEND_START_UTC' $cutoff
    }
    Set-Setting 'DHOLE_MAIN2_AUTOSEND_ENABLED' 'true'
}
else {
    Set-Setting 'DHOLE_MAIN2_AUTOSEND_ENABLED' 'false'
}

# Backup private .env outside the Git checkout; retain existing values.
$backupDir = Join-Path $env:LOCALAPPDATA 'CastroFallas\private-env-backups'
[void](New-Item -ItemType Directory -Path $backupDir -Force)
$backup = Join-Path $backupDir ('main2-env-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak')
Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop
$temp = Join-Path $root ('.env.update.' + [guid]::NewGuid().ToString('N'))
try {
    [IO.File]::WriteAllLines($temp, $lines.ToArray(), $utf8)
    Move-Item -LiteralPath $temp -Destination $path -Force -ErrorAction Stop
}
finally {
    Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue
}

if ($Action -eq 'enable') {
    Write-Host "Listo: habilitacion preparada con corte fijo UTC $cutoff."
    Write-Host 'No hay envios hasta reiniciar explicitamente Docker con el launcher main-2.'
}
else {
    Write-Host 'Listo: bandera desactivada en .env. Recrea backend para detener el worker.'
}
