// Generación del reporte diario: métricas (SQL) → tendencia (SQL) → resumen (agente analista) → guardado.
// Regenerar una fecha reemplaza el reporte de ese día (lo garantiza la función de guardado).
import { createAnalystAgent } from '../agents/analystAgent.js'
import { dailyReportRepository } from '../repositories/dailyReportRepository.js'

export const COSTA_RICA_TZ = 'America/Costa_Rica'

export function todayInCostaRica(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: COSTA_RICA_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function createDailyReportService({ repository = dailyReportRepository, analyst, today = () => todayInCostaRica() } = {}) {
  const getAnalyst = () => (analyst ??= createAnalystAgent())

  async function generate(auth, date = null) {
    const metrics = await repository.getMetrics(auth, date)
    const trend = await repository.getTrend(auth, metrics.report_date)
    const summary = await getAnalyst().summarize(metrics, { isToday: metrics.report_date === today() })
    const report = {
      ...metrics,
      trend_30d: trend,
      meta: {
        ...metrics.meta,
        narrative_source: summary.source,
        prompt_version: summary.promptVersion,
        ...(summary.rejectReason && { narrative_reject_reason: summary.rejectReason }),
      },
    }
    const id = await repository.save(auth, { reportDate: metrics.report_date, metrics: report, narrative: summary.text })
    return { id, reportDate: metrics.report_date, source: summary.source, rejectReason: summary.rejectReason, metrics: report, narrative: summary.text }
  }

  // Genera en orden D-(days-1) … D; si un día falla, sigue con los demás y lo reporta.
  async function backfill(auth, { days = 30, until = today() } = {}) {
    const results = []
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = addDays(until, -offset)
      try {
        results.push({ date, ok: true, ...(await generate(auth, date)) })
      } catch (error) {
        results.push({ date, ok: false, error: error.message })
      }
    }
    return results
  }

  return { generate, backfill }
}
