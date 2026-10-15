# Ejecutar desde cualquier carpeta: .\scripts\setup-docker.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sample = Join-Path $root '.env.example'
$target = Join-Path $root '.env'
if (Test-Path $target) {
    Write-Host 'El archivo .env ya existe. Se conserva sin modificar.'
    exit 0
}
function New-HexSecret([int] $length) {
    $bytes = New-Object byte[] $length
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [BitConverter]::ToString($bytes).Replace('-', '').ToLowerInvariant()
}
$template = [System.IO.File]::ReadAllText($sample)
$template = $template.Replace('CAMBIAR_PASSWORD_GENERADO', (New-HexSecret 24))
$template = $template.Replace('CAMBIAR_SECRETO_GENERADO_DE_64_CARACTERES', (New-HexSecret 32))
$template = $template.Replace('CAMBIAR_JWT_HEX_DE_64_CARACTERES', (New-HexSecret 32))
[System.IO.File]::WriteAllText($target, $template, ([System.Text.UTF8Encoding]::new($false)))
Write-Host '.env creado con contraseña PostgreSQL y secreto OTP aleatorios.'
Write-Host 'NO lo subas a GitHub. Revisa EMAIL_MODE (LocalOutbox/Smtp) si lo necesitas.'
