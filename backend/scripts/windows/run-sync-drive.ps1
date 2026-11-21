# Ejecuta npm run sync:drive y guarda la salida en backend/logs/sync-drive-AAAA-MM-DD.log.
# Lo invoca la tarea programada "RRHH-RAG sync:drive" (ver register-sync-task.ps1).
$ErrorActionPreference = 'Stop'
$backend = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$logs = Join-Path $backend 'logs'
New-Item -ItemType Directory -Force $logs | Out-Null
$log = Join-Path $logs ("sync-drive-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))

Set-Location $backend
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') inicio ====" | Out-File -Append -Encoding utf8 $log
# cmd redirige stdout y stderr al archivo: en PowerShell 5.1, con 'Stop', cada línea de stderr de un
# ejecutable nativo (avisos de Node) se convertiría en un error que corta el script.
& cmd.exe /d /c "npm.cmd run sync:drive >> `"$log`" 2>&1"
$code = $LASTEXITCODE
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') fin (código $code) ====" | Out-File -Append -Encoding utf8 $log

# Conserva 30 días de bitácoras.
Get-ChildItem $logs -Filter 'sync-drive-*.log' | Where-Object LastWriteTime -lt (Get-Date).AddDays(-30) | Remove-Item -Force
exit $code
