$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$pgctl = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
$dataDir = Join-Path $repoRoot '.local\postgres\data'

if (-not (Test-Path $pgctl)) {
  throw 'No se encontro pg_ctl.exe. Verifica PostgreSQL 17 instalado.'
}

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  Write-Output 'No hay cluster local para detener.'
  exit 0
}

& $pgctl -D $dataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Output 'PostgreSQL local ya estaba detenido.'
  exit 0
}

& $pgctl -D $dataDir stop -m fast | Out-Null
Write-Output 'PostgreSQL local detenido.'
