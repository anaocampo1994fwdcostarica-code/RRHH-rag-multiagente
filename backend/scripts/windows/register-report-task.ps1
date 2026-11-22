# Registra (o actualiza) la tarea diaria "RRHH-RAG report-daily" a las 7:00 a. m. hora de Costa Rica.
# Uso (PowerShell, sin necesidad de administrador):
#   powershell -ExecutionPolicy Bypass -File backend\scripts\windows\register-report-task.ps1
# Para quitarla: Unregister-ScheduledTask -TaskName 'RRHH-RAG report-daily' -Confirm:$false
$ErrorActionPreference = 'Stop'
$taskName = 'RRHH-RAG report-daily'
$runner = Join-Path $PSScriptRoot 'run-daily-report.ps1'

# El Programador de tareas usa la hora local. Costa Rica es UTC-6 sin horario de verano: si el equipo
# está en otra zona, se convierte 07:00 de Costa Rica a la hora local.
$costaRica = [TimeZoneInfo]::FindSystemTimeZoneById('Central America Standard Time')
$today = [DateTime]::SpecifyKind((Get-Date).Date.AddHours(7), [DateTimeKind]::Unspecified)
$at = [TimeZoneInfo]::ConvertTime($today, $costaRica, [TimeZoneInfo]::Local)

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runner`""
$trigger = New-ScheduledTaskTrigger -Daily -At $at
# StartWhenAvailable: si el equipo estaba apagado a las 7:00, corre al encenderlo.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Genera el reporte diario de RRHH (métricas SQL + resumen del agente analista) en daily_hr_reports. Bitácora en backend/logs.' -Force | Out-Null

Write-Host "Tarea '$taskName' registrada: todos los días a las $($at.ToString('HH:mm')) hora local (07:00 Costa Rica)."
Write-Host "Probarla ahora: Start-ScheduledTask -TaskName '$taskName'"
