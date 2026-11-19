import { withUserTransaction } from '../services/withUserTransaction.js'

// Consultas fijas, parametrizadas y de solo lectura del agente de datos.
// Doble protección: withUserTransaction aplica SET LOCAL ROLE authenticated (RLS) y, además, cada
// consulta filtra explícitamente por public.current_employee_id(). Ningún método recibe un
// employee_id, código ni nombre: la identidad sale siempre del usuario autenticado.
// "Hoy" es la fecha de Costa Rica. Las fechas se devuelven como texto AAAA-MM-DD.

const CR_TODAY = "(now() at time zone 'America/Costa_Rica')::date"

async function withLinkedEmployee(auth, transaction, callback) {
  return transaction(auth, async (client) => {
    const { rows: [context] } = await client.query(`select public.current_employee_id() as employee_id, ${CR_TODAY}::text as today`)
    if (!context?.employee_id) return { linked: false, today: context?.today ?? null }
    return { linked: true, today: context.today, ...(await callback(client, context.today)) }
  })
}

export function createDataAgentRepository({ transaction = withUserTransaction } = {}) {
  return {
    async vacationBalance(auth) {
      return withLinkedEmployee(auth, transaction, async (client) => {
        const { rows } = await client.query(`
          select period, assigned_days, taken_days, available_days
          from public.vacation_balances
          where employee_id = public.current_employee_id()
          order by period`)
        return { rows }
      })
    },

    async nextPayment(auth) {
      // El calendario de pagos no es personal, pero se exige igualmente un colaborador vinculado.
      return withLinkedEmployee(auth, transaction, async (client) => {
        const { rows } = await client.query(`
          select pay_date::text as pay_date, period_label, type
          from public.payroll_calendar
          where pay_date >= ${CR_TODAY}
          order by pay_date, type
          limit 3`)
        return { rows }
      })
    },

    async nextReview(auth) {
      return withLinkedEmployee(auth, transaction, async (client) => {
        const { rows } = await client.query(`
          select scheduled_date::text as scheduled_date, status
          from public.performance_reviews
          where employee_id = public.current_employee_id()
            and status = 'programada'
            and scheduled_date >= ${CR_TODAY}
          order by scheduled_date
          limit 1`)
        return { rows }
      })
    },

    async myRequests(auth, { date = null, isoWeekday = null, leaveType = null, status = null } = {}) {
      return withLinkedEmployee(auth, transaction, async (client) => {
        // "la del viernes": solicitudes que incluyen ese día de la semana entre hoy - 7 y hoy + 14.
        const { rows } = await client.query(`
          with ctx as (select ${CR_TODAY} as today)
          select lt.code as leave_type, lt.name as leave_type_name,
            lr.start_date::text as start_date, lr.end_date::text as end_date, lr.status,
            (lr.submitted_at at time zone 'America/Costa_Rica')::date::text as submitted_on,
            (lr.resolved_at at time zone 'America/Costa_Rica')::date::text as resolved_on
          from public.leave_requests lr
          join public.leave_types lt on lt.id = lr.leave_type_id
          cross join ctx
          where lr.employee_id = public.current_employee_id()
            and lr.deleted_at is null
            and ($1::date is null or $1::date between lr.start_date and lr.end_date)
            and ($2::text is null or lt.code = $2::text)
            and ($3::text is null or lr.status = $3::text)
            and ($4::integer is null or exists (
              select 1 from generate_series(greatest(lr.start_date, ctx.today - 7), least(lr.end_date, ctx.today + 14), interval '1 day') d
              where extract(isodow from d) = $4::integer))
          order by case when $4::integer is null and $1::date is null then null else abs(lr.start_date - ctx.today) end nulls last,
            lr.start_date desc
          limit 5`, [date, leaveType, status, isoWeekday])
        return { rows }
      })
    },

    async mySickLeaves(auth, { activeOnly = false } = {}) {
      return withLinkedEmployee(auth, transaction, async (client) => {
        const { rows } = await client.query(`
          with ctx as (select ${CR_TODAY} as today)
          select sl.type, sl.entity, sl.start_date::text as start_date, sl.end_date::text as end_date, sl.days,
            ctx.today between sl.start_date and sl.end_date as active
          from public.sick_leaves sl
          cross join ctx
          where sl.employee_id = public.current_employee_id()
            and ($1::boolean is false or ctx.today between sl.start_date and sl.end_date)
          order by sl.start_date desc
          limit 5`, [activeOnly])
        return { rows }
      })
    },

    // Solo RRHH: el orquestador lo enruta únicamente con alcance agregado y la consulta vuelve a exigir el permiso.
    async absencesToday(auth) {
      return transaction(auth, async (client) => {
        const { rows: [access] } = await client.query(`
          select (public.has_permission('employees.read') or public.has_permission('reports.read')) as allowed, ${CR_TODAY}::text as today`)
        if (!access?.allowed) return { allowed: false, today: access?.today ?? null }
        const absencesSql = `
          with ctx as (select ${CR_TODAY} as today),
          absences as (
            select lr.employee_id, 'permiso_aprobado' as category, lt.name as detail
            from public.leave_requests lr
            join public.leave_types lt on lt.id = lr.leave_type_id
            cross join ctx
            where lr.status = 'approved' and lr.deleted_at is null and ctx.today between lr.start_date and lr.end_date
            union all
            select sl.employee_id, 'incapacidad' as category, sl.type as detail
            from public.sick_leaves sl
            cross join ctx
            where ctx.today between sl.start_date and sl.end_date
          )`
        const { rows: breakdown } = await client.query(`${absencesSql}
          select d.name as department, a.category, a.detail, count(distinct a.employee_id)::integer as people
          from absences a
          join public.employees e on e.id = a.employee_id and e.deleted_at is null
          join public.departments d on d.id = e.department_id
          where public.has_permission('employees.read') or public.has_permission('reports.read')
          group by d.name, a.category, a.detail
          order by d.name, a.category, a.detail`)
        const { rows: totals } = await client.query(`${absencesSql}
          select a.category, count(distinct a.employee_id)::integer as people
          from absences a
          join public.employees e on e.id = a.employee_id and e.deleted_at is null
          where public.has_permission('employees.read') or public.has_permission('reports.read')
          group by a.category
          union all
          select 'total', count(distinct a.employee_id)::integer
          from absences a
          join public.employees e on e.id = a.employee_id and e.deleted_at is null
          where public.has_permission('employees.read') or public.has_permission('reports.read')`)
        return { allowed: true, today: access.today, breakdown, totals: Object.fromEntries(totals.map((row) => [row.category, row.people])) }
      })
    },
  }
}
