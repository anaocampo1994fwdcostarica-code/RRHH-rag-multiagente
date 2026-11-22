import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import AccessDenied from '../../components/AccessDenied.jsx'
import PermissionGate from '../../components/PermissionGate.jsx'
import { ErrorBlock, LoadingBlock } from '../../components/StatusBlocks.jsx'
import { classifyApiError, formatCount, formatDateTimeCostaRica, formatLongDate, getReportErrorMessage } from './reportPresentation.js'
import { listReportHistory } from './reportsApi.js'
import { useApiResource } from './useApiResource.js'

const head = 'whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600'
const sourceLabels = { llm: 'IA', template: 'Plantilla' }

function ReportsContent() {
  const navigate = useNavigate()
  const [retry, setRetry] = useState(0)
  const load = useCallback(() => listReportHistory({ limit: 30 }), [])
  const history = useApiResource(load, retry)

  if (history.status === 'loading') return <LoadingBlock label="Cargando historial de reportes…" />
  if (history.status === 'error') {
    if (classifyApiError(history.error) === 'forbidden') return <AccessDenied />
    return <ErrorBlock message={getReportErrorMessage(history.error)} onRetry={() => setRetry((value) => value + 1)} />
  }
  const rows = Array.isArray(history.data?.data) ? history.data.data : []
  const open = (date) => navigate(`/dashboard?date=${encodeURIComponent(date)}`)

  return <section aria-labelledby="history-title" className="mx-auto max-w-7xl rounded-lg border border-slate-200 bg-white shadow-sm"><div className="px-5 pt-5"><h2 id="history-title" className="text-lg font-semibold text-slate-900">Historial de reportes diarios</h2><p className="mt-1 text-sm text-slate-600">Selecciona un día para ver el reporte completo.</p></div>{rows.length ? <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-labelledby="history-title"><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">Reportes diarios generados, del más reciente al más antiguo</caption><thead className="bg-slate-50"><tr><th scope="col" className={head}>Fecha</th><th scope="col" className={head}>Generado</th><th scope="col" className={head}>Fuente</th><th scope="col" className={`${head} text-right`}>Ausentes</th><th scope="col" className={`${head} text-right`}>Pendientes</th><th scope="col" className={`${head} text-right`}>Más de 3 días</th><th scope="col" className={head}><span className="sr-only">Acciones</span></th></tr></thead><tbody>{rows.map((row) => <tr key={row.reportDate} onClick={() => open(row.reportDate)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"><th scope="row" className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">{formatLongDate(row.reportDate)}</th><td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDateTimeCostaRica(row.generatedAt)}</td><td className="px-3 py-3 text-slate-700">{sourceLabels[row.narrativeSource] ?? '—'}</td><td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatCount(row.absencesTotal)}</td><td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatCount(row.pendingTotal)}</td><td className="px-3 py-3 text-right tabular-nums text-slate-700">{formatCount(row.pendingOver3Days)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={(event) => { event.stopPropagation(); open(row.reportDate) }} className="rounded-lg border border-[#0f4c5c] px-3 py-1.5 font-medium text-[#0f4c5c] outline-none hover:bg-[#e8f1f3] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Ver<span className="sr-only"> reporte del {formatLongDate(row.reportDate)}</span></button></td></tr>)}</tbody></table></div> : <p className="px-5 py-10 text-center text-sm text-slate-600">Todavía no hay reportes generados.</p>}</section>
}

function ReportsPage() {
  return <PermissionGate permission="reports.read"><ReportsContent /></PermissionGate>
}

export default ReportsPage
