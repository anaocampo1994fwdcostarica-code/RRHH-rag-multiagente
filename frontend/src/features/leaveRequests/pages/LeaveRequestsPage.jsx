import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { listLeaveRequests } from '../leaveRequestsApi.js'
import { getLeaveRequestStatusLabel, leaveRequestStatuses, toLeaveRequestPresentation } from '../presentation.js'
import { useLeaveTypeCatalog } from '../useLeaveTypeCatalog.js'
import DatePicker from '../../../components/DatePicker.jsx'

function LeaveRequestsPage() {
  const [filters, setFilters] = useState({ status: '', startDateFrom: '', startDateTo: '', page: 1, limit: 20 })
  const [result, setResult] = useState({ data: [], total: 0, limit: 20 })
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const { getLeaveTypeLabel, state: leaveTypesState } = useLeaveTypeCatalog()

  useEffect(() => {
    let cancelled = false
    listLeaveRequests(filters)
      .then((response) => { if (!cancelled) { setResult(response); setState('ready') } })
      .catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar las solicitudes.'); setState('error') } })
    return () => { cancelled = true }
  }, [filters])

  const requests = useMemo(() => result.data.map((item) => toLeaveRequestPresentation(item, getLeaveTypeLabel)), [getLeaveTypeLabel, result.data])
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value, page: 1 }))
  const pageCount = Math.max(1, Math.ceil(result.total / result.limit))

  return <div className="mx-auto max-w-7xl">
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-2xl font-semibold tracking-tight text-slate-900">Solicitudes de permisos</h1><p className="mt-2 text-sm leading-6 text-slate-600">Consulta las solicitudes visibles para tu sesión y crea borradores propios.</p></div><Link to="/solicitudes/nueva" className="rounded-lg bg-[#0f4c5c] px-4 py-2 text-center text-sm font-medium text-white">Nueva solicitud</Link></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3"><label><span className="mb-1 block text-sm font-medium text-slate-700">Estado</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">{leaveRequestStatuses.map((status) => <option key={status} value={status}>{status ? getLeaveRequestStatusLabel(status) : 'Todos'}</option>)}</select></label><DatePicker id="requests-from" label="Desde" value={filters.startDateFrom} onChange={(value) => updateFilter('startDateFrom', value)} /><DatePicker id="requests-to" label="Hasta" value={filters.startDateTo} min={filters.startDateFrom || undefined} onChange={(value) => updateFilter('startDateTo', value)} /></div>
    </section>
    {state === 'loading' && <p className="mt-6 rounded-lg bg-white p-6 text-sm text-slate-500">Cargando solicitudes…</p>}
    {state === 'error' && <p className="mt-6 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">{error}</p>}
    {state === 'ready' && (requests.length ? <><div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Tipo de permiso</th><th className="px-4 py-3">Inicio</th><th className="px-4 py-3">Fin</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3"><span className="sr-only">Detalle</span></th></tr></thead><tbody>{requests.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{item.leaveTypeName}</td><td className="px-4 py-3 text-slate-600">{item.startDateLabel}</td><td className="px-4 py-3 text-slate-600">{item.endDateLabel}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.statusStyle}`}>{item.statusLabel}</span></td><td className="px-4 py-3 text-right"><Link to={`/solicitudes/${item.id}`} className="font-medium text-[#0f4c5c]">Ver detalle</Link></td></tr>)}</tbody></table></div></div>{leaveTypesState === 'error' && <p className="mt-3 text-xs text-slate-500">Los nombres de tipo de permiso no están disponibles temporalmente.</p>}<nav aria-label="Paginación de solicitudes" className="mt-6 flex items-center justify-center gap-3"><button type="button" disabled={filters.page === 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Anterior</button><span className="text-sm text-slate-600">Página {filters.page} de {pageCount}</span><button type="button" disabled={filters.page >= pageCount} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Siguiente</button></nav></> : <section className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="font-semibold text-slate-800">No hay solicitudes para estos filtros</h2><Link to="/solicitudes/nueva" className="mt-4 inline-flex text-sm font-medium text-[#0f4c5c]">Crear un borrador</Link></section>)}
  </div>
}

export default LeaveRequestsPage
