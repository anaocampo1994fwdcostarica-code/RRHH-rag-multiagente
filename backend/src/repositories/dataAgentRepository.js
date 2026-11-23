import { withUserTransaction } from '../services/withUserTransaction.js'

// Repositorio del agente de datos. Regla de arquitectura: las consultas viven en la base
// (migración 20261121090000_add_data_agent_functions.sql); aquí solo se invocan.
// - withUserTransaction aplica SET LOCAL ROLE authenticated, así que las funciones (SECURITY INVOKER)
//   corren con la RLS del usuario. Ninguna recibe identidad: usan current_employee_id() por dentro.
// - P0002 = usuario sin colaborador vinculado; 42501 = sin permiso para el agregado.

const NOT_LINKED = 'P0002'
const FORBIDDEN = '42501'

async function callFunction(transaction, auth, sql, values = []) {
  try {
    const rows = await transaction(auth, async (client) => (await client.query(sql, values)).rows)
    return { linked: true, today: rows[0]?.today ?? null, rows: rows.map(({ today: _today, ...row }) => row) }
  } catch (error) {
    if (error?.code === NOT_LINKED) return { linked: false, today: null, rows: [] }
    throw error
  }
}

export function createDataAgentRepository({ transaction = withUserTransaction } = {}) {
  return {
    vacationBalance: (auth) => callFunction(transaction, auth,
      'select period, assigned_days, taken_days, available_days, today::text as today from public.get_my_vacation_balance()'),

    nextPayment: (auth) => callFunction(transaction, auth,
      'select pay_date::text as pay_date, period_label, type, today::text as today from public.get_my_next_payment()'),

    nextReview: (auth) => callFunction(transaction, auth,
      'select scheduled_date::text as scheduled_date, status, today::text as today from public.get_my_next_review()'),

    myRequests: (auth, { date = null, isoWeekday = null, leaveType = null, status = null } = {}) => callFunction(transaction, auth,
      `select leave_type, leave_type_name, start_date::text as start_date, end_date::text as end_date, status,
        submitted_on::text as submitted_on, resolved_on::text as resolved_on, today::text as today
      from public.get_my_requests($1::date, $2::integer, $3::text, $4::text)`, [date, isoWeekday, leaveType, status]),

    mySickLeaves: (auth, { activeOnly = false } = {}) => callFunction(transaction, auth,
      `select type, entity, start_date::text as start_date, end_date::text as end_date, days, active, today::text as today
      from public.get_my_sick_leaves($1::boolean)`, [activeOnly === true]),

    async absencesToday(auth) {
      let rows
      try {
        rows = await transaction(auth, async (client) => (await client.query(
          'select level, department, category, detail, people, today::text as today from public.get_absences_today_summary()',
        )).rows)
      } catch (error) {
        if (error?.code === FORBIDDEN) return { allowed: false, today: null }
        throw error
      }
      const totals = Object.fromEntries(rows.filter((row) => row.level === 'category').map((row) => [row.category, row.people]))
      totals.total = rows.find((row) => row.level === 'total')?.people ?? 0
      return {
        allowed: true,
        today: rows[0]?.today ?? null,
        breakdown: rows.filter((row) => row.level === 'detail').map(({ department, category, detail, people }) => ({ department, category, detail, people })),
        totals,
      }
    },
  }
}
