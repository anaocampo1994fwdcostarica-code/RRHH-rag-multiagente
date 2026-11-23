// Plantillas deterministas del agente de datos: todo número y fecha del texto sale del resultado SQL.

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']

/** '2026-11-28' → 'sábado 28 de noviembre' (agrega el año si no es el de referencia). */
export function formatDate(isoDate, { referenceYear } = {}) {
  const [year, month, day] = String(isoDate).split('-').map(Number)
  const weekday = WEEKDAY_NAMES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  const text = `${weekday} ${day} de ${MONTH_NAMES[month - 1]}`
  return referenceYear && referenceYear !== year ? `${text} de ${year}` : text
}

const plural = (count, singular, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`
const yearOf = (isoDate) => Number(String(isoDate).slice(0, 4))

const STATUS_TEXT = {
  draft: 'está en borrador (todavía no la has enviado)',
  submitted: 'fue enviada y está pendiente de revisión',
  in_review: 'está en revisión por RRHH',
  approved: 'fue aprobada',
  rejected: 'fue rechazada',
  cancelled: 'fue cancelada',
}
const SICK_TYPE = { enfermedad: 'por enfermedad', accidente_laboral: 'por accidente laboral', maternidad: 'por maternidad' }
const ESCALATE = '¿Quieres que RRHH te contacte?'

export const NOT_LINKED = {
  evidenceStatus: 'no_data',
  escalationOffered: true,
  answer: `No encontré un expediente de colaborador vinculado a tu usuario, así que no puedo consultar tus datos. ${ESCALATE}`,
}

export function renderVacationBalance({ rows, today }) {
  if (!rows.length) return { evidenceStatus: 'no_data', escalationOffered: true, answer: `Todavía no hay un saldo de vacaciones registrado a tu nombre. ${ESCALATE}` }
  const currentYear = yearOf(today)
  const current = rows.find((row) => row.period === currentYear) ?? rows.at(-1)
  const totalAvailable = rows.reduce((sum, row) => sum + row.available_days, 0)
  let answer = `Te quedan ${plural(current.available_days, 'día')} de vacaciones disponibles en el periodo ${current.period}. Has tomado ${current.taken_days} de los ${current.assigned_days} asignados.`
  const previous = rows.filter((row) => row !== current && row.available_days > 0)
  if (previous.length) {
    const detail = previous.map((row) => `${plural(row.available_days, 'día')} del periodo ${row.period}`).join(' y ')
    answer += ` Además conservas ${detail}, para un total de ${plural(totalAvailable, 'día disponible', 'días disponibles')}.`
  }
  return { evidenceStatus: 'supported', escalationOffered: false, answer }
}

export function renderNextPayment({ rows, today }) {
  if (!rows.length) return { evidenceStatus: 'no_data', escalationOffered: true, answer: `No hay próximas fechas de pago publicadas en el calendario. ${ESCALATE}` }
  const referenceYear = yearOf(today)
  const [next] = rows
  let answer = next.pay_date === today
    ? `Tu próximo pago es hoy, ${formatDate(next.pay_date, { referenceYear })} (${next.period_label}).`
    : `Tu próximo pago es el ${formatDate(next.pay_date, { referenceYear })} (${next.period_label}).`
  const aguinaldo = rows.find((row) => row.type === 'aguinaldo' && row !== next)
  if (next.type !== 'aguinaldo' && aguinaldo) answer += ` El aguinaldo se paga el ${formatDate(aguinaldo.pay_date, { referenceYear })}.`
  return { evidenceStatus: 'supported', escalationOffered: false, answer }
}

export function renderNextReview({ rows, today }) {
  if (!rows.length) return { evidenceStatus: 'no_data', escalationOffered: true, answer: `No tienes una evaluación de desempeño programada por ahora. ${ESCALATE}` }
  return { evidenceStatus: 'supported', escalationOffered: false, answer: `Tu próxima evaluación de desempeño está programada para el ${formatDate(rows[0].scheduled_date, { referenceYear: yearOf(today) })}.` }
}

export function renderRequests({ rows, today }, { filtered = false } = {}) {
  if (!rows.length) {
    return { evidenceStatus: 'no_data', escalationOffered: true, answer: filtered
      ? `No encontré solicitudes tuyas que coincidan con esa fecha o tipo. ${ESCALATE}`
      : `No tienes solicitudes registradas. ${ESCALATE}` }
  }
  const referenceYear = yearOf(today)
  const describe = (row) => {
    const range = row.start_date === row.end_date
      ? `del ${formatDate(row.start_date, { referenceYear })}`
      : `del ${formatDate(row.start_date, { referenceYear })} al ${formatDate(row.end_date, { referenceYear })}`
    return `tu solicitud de ${row.leave_type_name.toLowerCase()} ${range} ${STATUS_TEXT[row.status] ?? `está en estado ${row.status}`}`
  }
  const [first, ...rest] = rows
  let answer = `${describe(first).replace(/^t/, 'T')}.`
  if (filtered && rest.length) answer += rest.length === 1 ? ' También encontré otra solicitud que coincide.' : ` También encontré otras ${rest.length} solicitudes que coinciden.`
  if (!filtered && rest.length) answer = `Estas son tus solicitudes más recientes: ${rows.map(describe).join('; ')}.`
  return { evidenceStatus: 'supported', escalationOffered: false, answer }
}

export function renderSickLeaves({ rows, today }) {
  if (!rows.length) return { evidenceStatus: 'no_data', escalationOffered: false, answer: 'No tienes incapacidades registradas.' }
  const referenceYear = yearOf(today)
  const describe = (row) => `${SICK_TYPE[row.type] ?? row.type} del ${formatDate(row.start_date, { referenceYear })} al ${formatDate(row.end_date, { referenceYear })} (${plural(row.days, 'día')}, cubierta por ${row.entity === 'empresa' ? 'la empresa' : row.entity})${row.active ? ', vigente hoy' : ''}`
  return { evidenceStatus: 'supported', escalationOffered: false, answer: `Tus incapacidades registradas: ${rows.map(describe).join('; ')}.` }
}

export function renderAbsencesToday({ allowed, breakdown = [], totals = {}, today }) {
  if (!allowed) return { evidenceStatus: 'restricted', escalationOffered: false, answer: 'Las cifras sobre otras personas de la plantilla solo están disponibles para el equipo de RRHH.' }
  const day = formatDate(today)
  if (!totals.total) return { evidenceStatus: 'supported', escalationOffered: false, answer: `Hoy, ${day}, no hay personas ausentes por permisos aprobados ni incapacidades.` }
  const byDepartment = new Map()
  for (const row of breakdown) {
    const item = row.category === 'incapacidad'
      ? `${row.people} con incapacidad ${SICK_TYPE[row.detail] ?? row.detail}`
      : `${row.people} de ${row.detail.toLowerCase()}`
    byDepartment.set(row.department, [...(byDepartment.get(row.department) ?? []), item])
  }
  const detail = [...byDepartment].map(([department, items]) => `${department}: ${items.join(', ')}`).join('; ')
  return {
    evidenceStatus: 'supported',
    escalationOffered: false,
    answer: `Hoy, ${day}, hay ${plural(totals.total, 'persona ausente', 'personas ausentes')}: ${plural(totals.permiso_aprobado ?? 0, 'por permiso aprobado', 'por permisos aprobados')} y ${plural(totals.incapacidad ?? 0, 'por incapacidad', 'por incapacidades')}. Por departamento: ${detail}.`,
  }
}
