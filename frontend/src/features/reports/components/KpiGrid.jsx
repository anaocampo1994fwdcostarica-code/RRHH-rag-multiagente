import StatCard from '../../../components/dashboard/StatCard.jsx'
import { formatCount, formatDays, formatMilliseconds, formatPercent, formatShortDate } from '../reportPresentation.js'

function KpiGrid({ metrics }) {
  const absences = metrics?.absences ?? {}
  const byType = absences.by_type ?? {}
  const requests = metrics?.requests ?? {}
  const sick = metrics?.sick_leaves ?? {}
  const turnover = metrics?.turnover ?? {}
  const chatbot = metrics?.chatbot ?? {}
  const pendingDays = metrics?.thresholds?.pending_days ?? 3

  const cards = [
    {
      label: 'Ausentes hoy', value: formatCount(absences.total_people), accent: 'bg-cyan-50 text-[#0f4c5c]', icon: '◉',
      description: <p>Vacaciones {formatCount(byType.vacaciones ?? 0)} · Permiso {formatCount(byType.permiso ?? 0)} · Incapacidad {formatCount(byType.incapacidad ?? 0)}</p>,
    },
    {
      label: 'Solicitudes pendientes', value: formatCount(requests.pending_total), accent: 'bg-amber-50 text-amber-800', icon: '◷',
      description: <p>{formatCount(requests.pending_over_3_days ?? 0)} con más de {pendingDays} días</p>,
    },
    {
      label: 'Incapacidades activas', value: formatCount(sick.active), accent: 'bg-rose-50 text-rose-800', icon: '✚',
      description: <p>{formatDays(sick.accumulated_days_month)} acumulados en el mes</p>,
    },
    {
      label: 'Rotación acumulada del año', value: formatPercent(turnover.rate_pct_ytd), accent: 'bg-violet-50 text-violet-800', icon: '↻',
      description: <><p>Ingresos del mes {formatCount(turnover.hires_month)} · Salidas {formatCount(turnover.exits_month)}</p>{turnover.formula ? <p>Fórmula: {turnover.formula}</p> : null}</>,
    },
    {
      label: 'Uso del asistente', value: formatCount(chatbot.total), accent: 'bg-teal-50 text-teal-800', icon: '✦',
      description: <><p>consultas{chatbot.date ? ` del ${formatShortDate(chatbot.date)}` : ''}</p><p>{formatPercent(chatbot.resolved_without_escalation_pct)} sin escalar · {formatMilliseconds(chatbot.avg_latency_ms)}</p></>,
    },
  ]

  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map((card) => <StatCard key={card.label} {...card} />)}</div>
}

export default KpiGrid
