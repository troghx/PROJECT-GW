$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
$initdb = Join-Path $pgBin 'initdb.exe'
$pgctl = Join-Path $pgBin 'pg_ctl.exe'
$psql = Join-Path $pgBin 'psql.exe'
$createdb = Join-Path $pgBin 'createdb.exe'

if (-not (Test-Path $initdb)) {
  throw 'No se encontro initdb.exe. Verifica PostgreSQL 17 instalado en C:\Program Files\PostgreSQL\17\bin'
}

$dataRoot = Join-Path $repoRoot '.local\postgres'
$dataDir = Join-Path $dataRoot 'data'
$logFile = Join-Path $dataRoot 'postgres.log'
$sqlPath = Join-Path $repoRoot 'db\init.sql'

New-Item -ItemType Directory -Force -Path $dataRoot | Out-Null

$password = if ($env:PG_LOCAL_PASSWORD) { $env:PG_LOCAL_PASSWORD } else { 'postgres' }
$pwFile = Join-Path $dataRoot 'pw.txt'
Set-Content -Path $pwFile -Value $password -NoNewline

if (-not (Test-Path (Join-Path $dataDir 'PG_VERSION'))) {
  & $initdb -D $dataDir -U postgres -A scram-sha-256 --pwfile=$pwFile | Out-Null

  Add-Content -Path (Join-Path $dataDir 'postgresql.conf') -Value "`nport = 5433"
  Add-Content -Path (Join-Path $dataDir 'postgresql.conf') -Value "listen_addresses = '127.0.0.1'"
}

Remove-Item -LiteralPath $pwFile -Force -ErrorAction SilentlyContinue

& $pgctl -D $dataDir status *> $null
if ($LASTEXITCODE -ne 0) {
  & $pgctl -D $dataDir -l $logFile start | Out-Null
}

$env:PGPASSWORD = $password
$dbExists = & $psql -h 127.0.0.1 -p 5433 -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='project_gw';"
if (($dbExists | Out-String).Trim() -ne '1') {
  & $createdb -h 127.0.0.1 -p 5433 -U postgres project_gw | Out-Null
}

& $psql -h 127.0.0.1 -p 5433 -U postgres -d project_gw -f $sqlPath | Out-Null

Write-Output 'PostgreSQL local listo en 127.0.0.1:5433 (DB: project_gw, User: postgres)'
