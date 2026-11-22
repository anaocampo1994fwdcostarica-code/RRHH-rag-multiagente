// Utilidades sobre el JSON de get_daily_report_metrics.

// Versión reducida que se envía al LLM: solo agregados. Nunca listas de personas, solicitudes ni
// preguntas literales (pueden contener datos personales). El validador usa este mismo objeto.
// Los textos (departamentos, temas) vienen de datos editables: se neutralizan < y > para que nadie cierre
// el bloque <metrics> desde un título de documento.
function neutralize(value) {
  if (typeof value === 'string') return value.replace(/[<>]/g, ' ')
  if (Array.isArray(value)) return value.map(neutralize)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, neutralize(v)]))
  return value
}

export function toLlmSafeMetrics(metrics, { isToday = true } = {}) {
  return neutralize(buildSafe(metrics, isToday))
}

function buildSafe(metrics, isToday) {
  const m = metrics ?? {}
  return {
    report_date: m.report_date,
    is_today: isToday,
    thresholds: m.thresholds,
    absences: m.absences && {
      total_people: m.absences.total_people,
      by_type: m.absences.by_type,
      by_department: m.absences.by_department,
    },
    requests: m.requests && {
      pending_total: m.requests.pending_total,
      pending_over_3_days: m.requests.pending_over_3_days,
    },
    sick_leaves: m.sick_leaves,
    turnover: m.turnover && {
      hires_month: m.turnover.hires_month,
      exits_month: m.turnover.exits_month,
      exits_year: m.turnover.exits_year,
      rate_pct_month: m.turnover.rate_pct_month,
      rate_pct_ytd: m.turnover.rate_pct_ytd,
    },
    vacation_over_20: m.vacation_over_20 && { count: m.vacation_over_20.count },
    chatbot: m.chatbot && {
      date: m.chatbot.date,
      total: m.chatbot.total,
      resolved_without_escalation: m.chatbot.resolved_without_escalation,
      resolved_without_escalation_pct: m.chatbot.resolved_without_escalation_pct,
      avg_latency_ms: m.chatbot.avg_latency_ms,
    },
    topics: m.topics && { top5: m.topics.top5, unanswered_count: m.topics.unanswered_count },
  }
}

// Nombres y códigos de personas presentes en el JSON completo (el resumen no puede mencionarlos).
export function collectPersonIdentifiers(metrics) {
  const people = [
    ...(metrics?.requests?.pending_list ?? []),
    ...(metrics?.vacation_over_20?.people ?? []),
  ]
  const values = new Set()
  for (const person of people) {
    if (person.employee_code) values.add(String(person.employee_code))
    if (person.employee_name) values.add(String(person.employee_name))
  }
  return [...values].filter((value) => value.trim().length >= 3)
}
