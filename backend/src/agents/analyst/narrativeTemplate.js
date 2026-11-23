// Plantilla determinista del resumen ejecutivo: se usa cuando el LLM falla o el validador rechaza su texto.
// Solo copia cifras del JSON (nunca calcula), así que siempre pasa el validador.

const fmt = (value) => (typeof value === 'number' ? String(value).replace('.', ',') : String(value))
const plural = (n, one, many) => (n === 1 ? one : many)

export function buildTemplateNarrative(metrics, { isToday = true } = {}) {
  const a = metrics.absences ?? {}
  const r = metrics.requests ?? {}
  const s = metrics.sick_leaves ?? {}
  const t = metrics.turnover ?? {}
  const c = metrics.chatbot ?? {}
  const v = metrics.vacation_over_20 ?? {}
  const days = metrics.thresholds?.pending_days ?? 3
  const type = a.by_type ?? {}

  // En un backfill (fecha pasada) no se dice "hoy": se nombra el día con la fecha del JSON.
  const [year, month, day] = String(metrics.report_date ?? '').split('-').map(Number)
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dayLabel = isToday || !day ? 'Hoy' : `El ${day} de ${MONTHS[month - 1]} de ${year}`
  const requestsNote = metrics.meta?.basis?.requests === 'aproximada' ? ' (cifra aproximada)' : ''
  const sentences = [
    `${dayLabel} ${isToday ? 'hay' : 'hubo'} ${fmt(a.total_people ?? 0)} ${plural(a.total_people, 'persona ausente', 'personas ausentes')}: ${fmt(type.vacaciones ?? 0)} por vacaciones, ${fmt(type.permiso ?? 0)} por permiso y ${fmt(type.incapacidad ?? 0)} por incapacidad.`,
    `Hay ${fmt(r.pending_total ?? 0)} ${plural(r.pending_total, 'solicitud pendiente', 'solicitudes pendientes')}${requestsNote}, de las cuales ${fmt(r.pending_over_3_days ?? 0)} ${plural(r.pending_over_3_days, 'lleva', 'llevan')} más de ${fmt(days)} días sin resolverse.`,
    `Las incapacidades activas son ${fmt(s.active ?? 0)} y suman ${fmt(s.accumulated_days_month ?? 0)} días en el mes; además, ${fmt(v.count ?? 0)} ${plural(v.count, 'colaborador acumula', 'colaboradores acumulan')} más de ${fmt(metrics.thresholds?.vacation_days ?? 20)} días de vacaciones.`,
    t.rate_pct_ytd === null || t.rate_pct_ytd === undefined
      ? `En el mes hubo ${fmt(t.hires_month ?? 0)} ingresos y ${fmt(t.exits_month ?? 0)} salidas.`
      : `En el mes hubo ${fmt(t.hires_month ?? 0)} ingresos y ${fmt(t.exits_month ?? 0)} salidas, con una rotación acumulada del año de ${fmt(t.rate_pct_ytd)} %.`,
    !c.total
      ? 'El asistente no registró consultas el día anterior.'
      : `El asistente atendió ${fmt(c.total)} consultas el día anterior, ${fmt(c.resolved_without_escalation_pct)} % resueltas sin escalar, con una latencia promedio de ${fmt(c.avg_latency_ms)} ms.`,
  ]
  return sentences.join(' ')
}
