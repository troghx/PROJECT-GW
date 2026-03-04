@echo off
setlocal

cd /d "%~dp0"

echo [1/3] Deteniendo backend en puerto 3000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique; if (-not $pids) { Write-Output 'No habia proceso escuchando en 3000.'; exit 0 }; foreach ($pid in $pids) { try { Stop-Process -Id $pid -ErrorAction Stop; Start-Sleep -Milliseconds 700; if (Get-Process -Id $pid -ErrorAction SilentlyContinue) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue; Write-Output ('PID ' + $pid + ' detenido (force).') } else { Write-Output ('PID ' + $pid + ' detenido.') } } catch { Write-Output ('PID ' + $pid + ' no pudo detenerse: ' + $_.Exception.Message) } }"

echo [2/3] Deteniendo PostgreSQL local...
call npm run db:stop-local
if errorlevel 1 (
  echo Aviso: db:stop-local termino con error.
)

echo [3/3] Verificando puertos...
powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { 'Puerto 3000 sigue en uso.' } else { 'Puerto 3000 liberado.' }; if (Get-NetTCPConnection -LocalPort 5433 -State Listen -ErrorAction SilentlyContinue) { 'Puerto 5433 sigue en uso.' } else { 'Puerto 5433 liberado.' }"

echo Shutdown finalizado.
endlocal
