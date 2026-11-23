import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { getAdminLeaveRequest } from '../adminLeaveRequestsApi.js'
import { cleanReason, getLeaveRequestStatusLabel, getLeaveRequestStatusStyle } from '../presentation.js'

function AdminLeaveRequestDetailPage() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    getAdminLeaveRequest(id).then((response) => { if (!cancelled) { setRequest(response.data); setState('ready') } }).catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar la solicitud.'); setState('error') } })
    return () => { cancelled = true }
  }, [id])
  if (state === 'loading') return <p className="mx-auto max-w-4xl rounded-lg bg-white p-6 text-sm text-slate-500">Cargando solicitud…</p>
  if (state === 'error') return <section className="mx-auto max-w-4xl rounded-lg border border-rose-200 bg-rose-50 p-6"><h1 className="text-xl font-semibold">Solicitud no disponible</h1><p className="mt-2 text-sm">{error}</p><Link to="/gestion-solicitudes" className="mt-5 inline-flex text-sm font-medium text-[#0f4c5c]">Volver a gestión</Link></section>
  return <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><Link to="/gestion-solicitudes" className="text-sm font-medium text-[#0f4c5c]">← Volver a gestión</Link><header className="mt-6 border-b border-slate-100 pb-6"><p className="text-sm font-medium text-slate-500">Detalle administrativo</p><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-slate-900">{request.leaveTypeName ?? 'Tipo de permiso'}</h1><span className={`rounded-full px-3 py-1 text-xs font-semibold ${getLeaveRequestStatusStyle(request.status)}`}>{getLeaveRequestStatusLabel(request.status)}</span></div></header><dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Empleado</dt><dd className="mt-1 font-semibold">{request.employee?.displayName ?? 'Nombre no disponible'}</dd><dd className="text-xs text-slate-500">{request.employee?.employeeCode ?? 'Código no disponible'}</dd></div><div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Enviada</dt><dd className="mt-1 font-semibold">{request.submittedAt ? new Date(request.submittedAt).toLocaleString('es-CR') : 'Sin enviar'}</dd></div><div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Inicio</dt><dd className="mt-1 font-semibold">{request.startDate}</dd></div><div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Fin</dt><dd className="mt-1 font-semibold">{request.endDate}</dd></div><div className="rounded-lg border border-slate-200 p-4 sm:col-span-2"><dt className="text-slate-500">Motivo</dt><dd className="mt-2 whitespace-pre-wrap font-medium">{cleanReason(request.reason) || 'Sin motivo indicado.'}</dd></div></dl><section className="mt-8 rounded-lg border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-900">Acciones administrativas</h2><p className="mt-1 text-sm text-amber-800">La revisión, aprobación y rechazo permanecerán deshabilitados hasta que se implemente y valide la máquina de estados administrativa.</p><div className="mt-4 flex flex-wrap gap-3"><button disabled className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-500 disabled:cursor-not-allowed">Iniciar revisión</button><button disabled className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-500 disabled:cursor-not-allowed">Aprobar</button><button disabled className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-500 disabled:cursor-not-allowed">Rechazar</button></div></section></article>
}

export default AdminLeaveRequestDetailPage
