import { createHttpError } from '../errors/httpError.js'
import { dailyReportRepository } from '../repositories/dailyReportRepository.js'
import { parseHistoryQuery, parseReportDate } from '../validation/reports.js'

// El dashboard SOLO lee daily_hr_reports (los reportes los genera npm run report:daily).
export function createReportsController({ repository = dailyReportRepository } = {}) {
  return {
    async daily(request, response, next) {
      try {
        const date = parseReportDate(request.query.date)
        let report = await repository.getReport(request.auth, date)
        // Sin fecha y sin reporte de hoy (antes de las 07:00 o si la tarea falló): se muestra el último disponible.
        let isLatestFallback = false
        if (!report && date === null) {
          const [latest] = await repository.listReports(request.auth, { limit: 1, before: null })
          if (latest) { report = await repository.getReport(request.auth, latest.report_date); isLatestFallback = Boolean(report) }
        }
        if (!report) throw createHttpError(404, 'No report for that date')
        response.status(200).json({
          data: { reportDate: report.report_date, generatedAt: report.generated_at, narrative: report.narrative, metrics: report.metrics, isLatestFallback },
        })
      } catch (error) { next(error) }
    },
    async history(request, response, next) {
      try {
        const query = parseHistoryQuery(request.query)
        const rows = await repository.listReports(request.auth, query)
        response.status(200).json({
          data: rows.map((row) => ({
            reportDate: row.report_date, generatedAt: row.generated_at, narrativeSource: row.narrative_source,
            absencesTotal: row.absences_total, pendingTotal: row.pending_total, pendingOver3Days: row.pending_over_3_days,
          })),
        })
      } catch (error) { next(error) }
    },
  }
}

const controller = createReportsController()
export const getDailyReport = controller.daily
export const getDailyReportHistory = controller.history
