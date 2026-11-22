// npm run report:daily [-- --date=AAAA-MM-DD | --backfill[=30]]
// Genera el reporte diario de RRHH (cifras por funciones SQL, resumen por el agente analista) y lo guarda
// en daily_hr_reports. Regenerar una fecha reemplaza el reporte de ese día.
// - Sin argumentos: hoy en hora de Costa Rica (lo usa la tarea de Windows de las 07:00).
// - --backfill[=N]: los últimos N días (30 por defecto), en orden, terminando hoy.
// Firma RAG_INGEST_USER_ID o el usuario RRHH de pruebas (rls.hr, DEMO-011); debe tener reports.read.
// Plazo del LLM: el modelo razona antes de responder y el CLI no tiene a nadie esperando, así que se usan 60 s
// salvo que DEEPSEEK_TIMEOUT_MS venga del entorno o de .env. (Los imports se evalúan antes que esta línea; funciona
// porque el proveedor lee la variable al crearse, dentro de createDailyReportService().generate.)
process.env.DEEPSEEK_TIMEOUT_MS ??= '60000'
import { closeScriptPool, resolveIngestIdentity } from './lib/ragScriptContext.mjs'
import { parseReportDate } from '../src/validation/reports.js'
import { createDailyReportService, todayInCostaRica } from '../src/services/dailyReportService.js'

function parseArgs(argv) {
  const options = { date: null, backfill: null }
  for (const arg of argv) {
    const [key, value] = arg.split('=')
    if (key === '--date') {
      if (!value) throw new Error('--date necesita un valor: --date=AAAA-MM-DD.')
      options.date = parseReportDate(value)
    }
    else if (key === '--backfill') options.backfill = value === undefined ? 30 : Number(value)
    else throw new Error(`Argumento desconocido: ${arg}. Uso: --date=AAAA-MM-DD | --backfill[=30]`)
  }
  if (options.date && options.backfill) throw new Error('Usa --date o --backfill, no ambos.')
  if (options.backfill !== null && (!Number.isInteger(options.backfill) || options.backfill < 1 || options.backfill > 366)) throw new Error('--backfill debe ser un entero entre 1 y 366.')
  if (options.date && options.date > todayInCostaRica()) throw new Error('La fecha no puede ser futura (hora de Costa Rica).')
  return options
}

function line(result) {
  if (!result.ok) return `${result.date}  ERROR  ${result.error}`
  const m = result.metrics
  return `${result.reportDate}  ${result.source === 'llm' ? 'IA       ' : 'plantilla'}  ausentes ${m.absences.total_people}, pendientes ${m.requests.pending_total} (${m.requests.pending_over_3_days} > 3 días), chat ${m.chatbot.total}${result.rejectReason ? `  [rechazo: ${result.rejectReason}]` : ''}`
}

try {
  const options = parseArgs(process.argv.slice(2))
  const auth = await resolveIngestIdentity()
  const service = createDailyReportService()
  const results = options.backfill
    ? await service.backfill(auth, { days: options.backfill })
    : [await service.generate(auth, options.date).then((r) => ({ ok: true, ...r }), (error) => ({ ok: false, date: options.date ?? todayInCostaRica(), error: error.message }))]
  for (const result of results) {
    console.log(line(result))
    // La plantilla es un respaldo válido (código 0), pero queda visible en la bitácora de la tarea.
    if (result.ok && result.source === 'template') console.log(`WARN ${result.reportDate}: resumen con plantilla (${result.rejectReason ?? 'sin motivo'})`)
  }
  const failed = results.filter((result) => !result.ok).length
  console.log(`Reportes generados: ${results.length - failed}/${results.length}.`)
  if (failed) process.exitCode = 1
} catch (error) {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
} finally {
  await closeScriptPool().catch(() => {})
}
