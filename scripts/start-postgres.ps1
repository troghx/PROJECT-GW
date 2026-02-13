$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$pgctl = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
$dataDir = Join-Path $repoRoot '.local\postgres\data'
$logFile = Join-Path $repoRoot '.local\postgres\postgres.log'

if (-not (Test-Path $pgctl)) {
  throw 'No se encontro pg_ctl.exe. Verifica PostgreSQL 17 instalado.'
}

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  throw 'Cluster local no inicializado. Ejecuta primero: npm run db:init-local'
}

& $pgctl -D $dataDir status *> $null
if ($LASTEXITCODE -eq 0) {
  Write-Output 'PostgreSQL local ya estaba corriendo.'
  exit 0
}

& $pgctl -D $dataDir -l $logFile start | Out-Null
Write-Output 'PostgreSQL local iniciado en 127.0.0.1:5433'
