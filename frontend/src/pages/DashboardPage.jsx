import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'
import AccessDenied from '../components/AccessDenied.jsx'
import PermissionGate from '../components/PermissionGate.jsx'
import { ErrorBlock, LoadingBlock } from '../components/StatusBlocks.jsx'
import DateSelector from '../features/reports/components/DateSelector.jsx'
import { ExecutiveSummary, TopTopics, UnansweredQuestions, VacationOver20 } from '../features/reports/components/InsightBlocks.jsx'
import KpiGrid from '../features/reports/components/KpiGrid.jsx'
import PendingRequestsTable from '../features/reports/components/PendingRequestsTable.jsx'
import { DepartmentChart, TrendChart } from '../features/reports/components/ReportCharts.jsx'
import { classifyApiError, formatDateTimeCostaRica, formatLongDate, getBasisNotes, getReportErrorMessage, isValidDateKey, todayInCostaRica } from '../features/reports/reportPresentation.js'
import { getDailyReport, listReportHistory } from '../features/reports/reportsApi.js'
import { useApiResource } from '../features/reports/useApiResource.js'

function DashboardContent() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawDate = searchParams.get('date')
  const date = isValidDateKey(rawDate) ? rawDate : null
  const today = todayInCostaRica()
  const [retry, setRetry] = useState(0)

  const loadReport = useCallback(() => getDailyReport(date), [date])
  const loadHistory = useCallback(() => listReportHistory({ limit: 30 }), [])
  const report = useApiResource(loadReport, retry)
  const history = useApiResource(loadHistory)

  const changeDate = (next) => setSearchParams(next ? { date: next } : {}, { replace: true })
  const selector = <DateSelector value={date ?? today} max={today} history={history.data?.data} onChange={changeDate} />

  if (report.status === 'error' && classifyApiError(report.error) === 'forbidden') return <AccessDenied />

  let body
  if (report.status === 'loading') body = <LoadingBlock label="Cargando reporte…" />
  else if (report.status === 'error') {
    const notFound = classifyApiError(report.error) === 'not-found'
    body = notFound
      ? <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700"><p className="font-medium text-slate-900">No hay reporte para {formatLongDate(date ?? today)}.</p><p className="mt-1">Elige otra fecha en el selector o en la lista de días disponibles.</p></div>
      : <ErrorBlock message={getReportErrorMessage(report.error)} onRetry={classifyApiError(report.error) === 'invalid' ? undefined : () => setRetry((value) => value + 1)} />
  } else {
    const data = report.data?.data
    const metrics = data?.metrics
    if (!data || !metrics) body = <div role="status" className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-700">El reporte no contiene datos.</div>
    else {
      const notes = getBasisNotes(metrics.meta)
      body = <div className="space-y-6">{data.isLatestFallback && !date ? <p role="status" className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-700">Aún no hay reporte de hoy; se muestra el del {formatLongDate(data.reportDate)}.</p> : null}<p className="text-sm text-slate-600">Reporte del <strong className="font-semibold text-slate-900">{formatLongDate(data.reportDate)}</strong> · generado el {formatDateTimeCostaRica(data.generatedAt)} (hora de Costa Rica)</p><ExecutiveSummary narrative={data.narrative} source={metrics.meta?.narrative_source} /><section aria-labelledby="kpi-title"><h2 id="kpi-title" className="sr-only">Indicadores principales</h2><KpiGrid metrics={metrics} /></section><div className="grid gap-6 xl:grid-cols-2"><TrendChart trend={metrics.trend_30d} /><DepartmentChart departments={metrics.absences?.by_department} /></div><PendingRequestsTable requests={metrics.requests?.pending_list} thresholdDays={metrics.thresholds?.pending_days ?? 3} /><div className="grid gap-6 lg:grid-cols-3"><TopTopics topics={metrics.topics} /><UnansweredQuestions topics={metrics.topics} /><VacationOver20 data={metrics.vacation_over_20} /></div>{notes.length ? <ul className="space-y-1 text-xs text-slate-600">{notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}</div>
    }
  }

  return <div className="mx-auto max-w-7xl space-y-6"><h2 className="sr-only">Dashboard de Recursos Humanos</h2>{selector}{body}</div>
}

function DashboardPage() {
  return <PermissionGate permission="reports.read"><DashboardContent /></PermissionGate>
}

export default DashboardPage
