import { createHttpError } from '../errors/httpError.js'
import { isVerifiedAuthIdentity } from '../security/authIdentity.js'
import { getPostgresPool } from '../services/postgresPool.js'
import { withUserTransaction } from '../services/withUserTransaction.js'

// Reporte diario. Regla del proyecto: las cifras salen de funciones SQL
// (migración 20261122090000_add_daily_report_functions.sql); aquí solo se invocan.
// - Lecturas: withUserTransaction (SET LOCAL ROLE authenticated): las funciones exigen reports.read.
// - Guardado: login rrhh_api SIN SET ROLE, porque app_private.save_daily_hr_report solo la ejecuta rrhh_api.

function mapDatabaseError(error) {
  if (error?.code === '42501') return createHttpError(403, 'Forbidden')
  if (error?.code === '22023') return createHttpError(400, 'Invalid report date')
  return error
}

export function createDailyReportRepository({ transaction = withUserTransaction, getPool = getPostgresPool } = {}) {
  async function run(auth, sql, values) {
    try {
      return await transaction(auth, async (client) => (await client.query(sql, values)).rows)
    } catch (error) {
      throw mapDatabaseError(error)
    }
  }

  return {
    async getMetrics(auth, date = null) {
      const [row] = await run(auth, 'select public.get_daily_report_metrics($1::date) as metrics', [date])
      return row.metrics
    },

    async getTrend(auth, date = null) {
      return run(auth, 'select day::text as day, absences, chat_queries from public.get_hr_trend_30d($1::date)', [date])
    },

    async getReport(auth, date = null) {
      const [row] = await run(auth,
        'select report_date::text as report_date, metrics, narrative, generated_at from public.get_daily_report($1::date)', [date])
      return row ?? null
    },

    async listReports(auth, { limit = 30, before = null } = {}) {
      return run(auth,
        `select report_date::text as report_date, generated_at, narrative_source, absences_total, pending_total, pending_over_3_days
        from public.list_daily_reports($1::integer, $2::date)`, [limit, before])
    },

    async save(auth, { reportDate, metrics, narrative }) {
      if (!isVerifiedAuthIdentity(auth)) throw new TypeError('Saving a daily report requires a verified identity.')
      const pool = await getPool()
      try {
        const { rows: [row] } = await pool.query(
          'select app_private.save_daily_hr_report($1::date, $2::jsonb, $3, $4::uuid) as id',
          [reportDate, JSON.stringify(metrics), narrative, auth.userId],
        )
        return row.id
      } catch (error) {
        throw mapDatabaseError(error)
      }
    },
  }
}

export const dailyReportRepository = createDailyReportRepository()
