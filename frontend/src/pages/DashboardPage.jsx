import ActivityChart from '../components/dashboard/ActivityChart.jsx'
import DocumentsSummary from '../components/dashboard/DocumentsSummary.jsx'
import RequestsBoard from '../components/dashboard/RequestsBoard.jsx'
import StatCard from '../components/dashboard/StatCard.jsx'

const metrics = [
  { label: 'Total de empleados', value: '248', description: 'Registro simulado para esta demostración.', accent: 'bg-cyan-50 text-[#0f4c5c]', icon: '◉' },
  { label: 'Solicitudes pendientes', value: '12', description: 'Ejemplo de bandeja de atención.', accent: 'bg-amber-50 text-amber-700', icon: '◷' },
  { label: 'Consultas a la IA', value: '86', description: 'Actividad ficticia del periodo.', accent: 'bg-violet-50 text-violet-700', icon: '✦' },
  { label: 'Documentos disponibles', value: '34', description: 'Catálogo de muestra sin conexión.', accent: 'bg-teal-50 text-teal-700', icon: '▤' },
]

function DashboardPage() {
  return <div className="mx-auto max-w-7xl space-y-6"><section aria-labelledby="overview-title"><div className="mb-4 flex items-center gap-2"><h2 id="overview-title" className="text-base font-semibold text-slate-800">Resumen general</h2><span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">Datos simulados</span></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{metrics.map((metric) => <StatCard key={metric.label} {...metric} />)}</div></section><div className="grid gap-6 xl:grid-cols-3"><div className="xl:col-span-2"><ActivityChart /></div><DocumentsSummary /></div><RequestsBoard /><section aria-labelledby="report-title" className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-6 sm:px-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-[#0f4c5c]">Próxima etapa</p><h2 id="report-title" className="mt-1 font-semibold text-slate-900">Reporte diario de RRHH</h2><p className="mt-1 text-sm text-slate-500">La generación automática de reportes se habilitará en una fase posterior.</p></div><span className="w-fit rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-500">No configurado</span></div></section></div>
}

export default DashboardPage
