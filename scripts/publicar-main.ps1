# Actualiza main de https://github.com/CustomCodeCR/PangolinBackend sin git push --force.
# Clona la version actual y superpone los archivos de ESTE ZIP; no elimina otros archivos
# presentes en GitHub. Se excluyen .env, secretos y carpetas generadas.
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path.TrimEnd('\', '/')
$remote = 'https://github.com/CustomCodeCR/PangolinBackend.git'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Debes instalar Git.' }

function Run-Git([string[]] $arguments) {
    & git @arguments
    if ($LASTEXITCODE -ne 0) { throw "Git termino con error: git $($arguments -join ' ')" }
}

$tempBase = if ($env:TEMP) { $env:TEMP } else { [System.IO.Path]::GetTempPath() }
$repo = Join-Path $tempBase ('castrofallas-main-' + [Guid]::NewGuid().ToString('N'))
$success = $false
try {
    Write-Host 'Descargando la version actual de main...'
    Run-Git -arguments @('clone', '--branch', 'main', '--single-branch', $remote, $repo)
    $excludedFolders = @('.git', 'node_modules', 'dist', 'bin', 'obj', 'TestResults', 'local-outbox', '.backup', '.vs', '.vscode', '__pycache__')
    $copied = 0
    Get-ChildItem -LiteralPath $root -Recurse -Force -File | ForEach-Object {
        $relative = $_.FullName.Substring($root.Length).TrimStart('\', '/')
        $segments = $relative -split '[\\/]'
        $skip = $false
        foreach ($segment in $segments) { if ($excludedFolders -contains $segment) { $skip = $true; break } }
        if ($_.Name -eq '.env' -or ($_.Name -like '.env.*' -and $_.Name -ne '.env.example')) { $skip = $true }
        if ($_.Name -like '*.pfx' -or $_.Name -like '*.pem' -or $_.Name -like '*.key' -or $_.Name -like '*.dump' -or $_.Name -like '*.bak') { $skip = $true }
        if (-not $skip) {
            $to = Join-Path $repo $relative
            $parent = Split-Path -Parent $to
            if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
            Copy-Item -LiteralPath $_.FullName -Destination $to -Force
            $copied++
        }
    }
    Write-Host "Archivos del proyecto preparados: $copied. Sin incluir .env."
    Run-Git -arguments @('-C', $repo, 'add', '-A')
    & git -C $repo diff --cached --quiet
    $diffExit = $LASTEXITCODE
    if ($diffExit -eq 0) {
        Write-Host 'main ya tiene los mismos archivos; no hay cambios que publicar.'
    } elseif ($diffExit -eq 1) {
        Write-Host 'Se publicaran los archivos modificados. Se respetan los archivos existentes no incluidos en el ZIP.'
        Run-Git -arguments @('-C', $repo, 'commit', '-m', 'Actualizar proyecto Castro Fallas y arranque Docker PostgreSQL')
        Run-Git -arguments @('-C', $repo, 'push', 'origin', 'main')
        Write-Host 'OK: main actualizado en GitHub.' -ForegroundColor Green
    } else {
        throw 'Error al comparar los archivos de Git.'
    }
    $success = $true
} finally {
    if ($success) {
        Remove-Item -LiteralPath $repo -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Host "Si fallo la operacion, revisa el clon temporal: $repo" -ForegroundColor Yellow
    }
}
