import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { getLeaveRequest } from '../leaveRequestsApi.js'

function LeaveRequestDetailPage() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  useEffect(() => { let cancelled = false; getLeaveRequest(id).then((response) => { if (!cancelled) { setRequest(response.data); setState('ready') } }).catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar la solicitud.'); setState('error') } }); return () => { cancelled = true } }, [id])
  if (state === 'loading') return <p className="mx-auto max-w-3xl rounded-lg bg-white p-6 text-sm text-slate-500">Cargando solicitud…</p>
  if (state === 'error') return <section className="mx-auto max-w-3xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h1 className="text-xl font-semibold">Solicitud no disponible</h1><p className="mt-2 text-sm text-slate-500">{error}</p><Link to="/solicitudes" className="mt-5 inline-flex text-sm font-medium text-[#0f4c5c]">Volver a solicitudes</Link></section>
  return <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><Link to="/solicitudes" className="text-sm font-medium text-[#0f4c5c]">← Volver a solicitudes</Link><h1 className="mt-6 text-2xl font-semibold">Detalle de solicitud</h1><dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Estado</dt><dd className="mt-1 font-medium">{request.status}</dd></div><div><dt className="text-slate-500">Tipo de permiso</dt><dd className="mt-1 font-medium">{request.leaveTypeId}</dd></div><div><dt className="text-slate-500">Fecha inicial</dt><dd className="mt-1 font-medium">{request.startDate}</dd></div><div><dt className="text-slate-500">Fecha final</dt><dd className="mt-1 font-medium">{request.endDate}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Motivo</dt><dd className="mt-1 whitespace-pre-wrap font-medium">{request.reason || 'Sin motivo indicado.'}</dd></div></dl><p className="mt-8 text-xs text-slate-500">Las acciones de envío, aprobación, rechazo y cancelación estarán disponibles en una fase posterior.</p></article>
}

export default LeaveRequestDetailPage
