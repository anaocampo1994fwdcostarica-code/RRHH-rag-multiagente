import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { getLeaveRequest, submitLeaveRequest } from '../leaveRequestsApi.js'
import { toLeaveRequestPresentation } from '../presentation.js'
import { canSubmitLeaveRequest, isLeaveRequestSubmissionEnabled } from '../submissionFeature.js'
import { useLeaveTypeCatalog } from '../useLeaveTypeCatalog.js'

function LeaveRequestDetailPage() {
  const { id } = useParams()
  const [request, setRequest] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [submissionState, setSubmissionState] = useState('idle')
  const [submissionError, setSubmissionError] = useState('')
  const { getLeaveTypeLabel } = useLeaveTypeCatalog()

  useEffect(() => {
    let cancelled = false
    getLeaveRequest(id)
      .then((response) => {
        if (!cancelled) {
          setRequest(response.data)
          setState('ready')
        }
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar la solicitud.')
          setState('error')
        }
      })
    return () => { cancelled = true }
  }, [id])

  const display = useMemo(
    () => request ? toLeaveRequestPresentation(request, getLeaveTypeLabel) : null,
    [getLeaveTypeLabel, request],
  )
  const submissionEnabled = isLeaveRequestSubmissionEnabled()
  const canSubmit = canSubmitLeaveRequest(request)

  async function handleSubmit() {
    if (!canSubmit || submissionState === 'submitting') return
    if (!globalThis.confirm('¿Deseas enviar esta solicitud para revisión?')) return

    setSubmissionError('')
    setSubmissionState('submitting')
    try {
      const response = await submitLeaveRequest(id)
      setRequest(response.data)
      setSubmissionState('submitted')
    } catch (submitError) {
      setSubmissionError(submitError instanceof ApiError ? submitError.message : 'No fue posible enviar la solicitud.')
      setSubmissionState('error')
    }
  }

  if (state === 'loading') {
    return <p className="mx-auto max-w-3xl rounded-lg bg-white p-6 text-sm text-slate-500">Cargando solicitud…</p>
  }

  if (state === 'error') {
    return <section className="mx-auto max-w-3xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <h1 className="text-xl font-semibold">Solicitud no disponible</h1>
      <p className="mt-2 text-sm text-slate-500">{error}</p>
      <Link to="/solicitudes" className="mt-5 inline-flex text-sm font-medium text-[#0f4c5c]">Volver a solicitudes</Link>
    </section>
  }

  return <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <Link to="/solicitudes" className="text-sm font-medium text-[#0f4c5c]">← Volver a solicitudes</Link>
    <header className="mt-6 border-b border-slate-100 pb-6">
      <p className="text-sm font-medium text-slate-500">Detalle de solicitud</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{display.leaveTypeName}</h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${display.statusStyle}`}>{display.statusLabel}</span>
      </div>
      <p className="mt-3 text-sm text-slate-600">Solicitud registrada para el período indicado.</p>
    </header>

    <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2">
      <div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Tipo de permiso</dt><dd className="mt-1 font-semibold text-slate-800">{display.leaveTypeName}</dd></div>
      <div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Estado</dt><dd className="mt-1 font-semibold text-slate-800">{display.statusLabel}</dd></div>
      <div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Fecha inicial</dt><dd className="mt-1 font-semibold text-slate-800">{display.startDateLabel}</dd></div>
      <div className="rounded-lg bg-slate-50 p-4"><dt className="text-slate-500">Fecha final</dt><dd className="mt-1 font-semibold text-slate-800">{display.endDateLabel}</dd></div>
      <div className="rounded-lg border border-slate-200 p-4 sm:col-span-2"><dt className="text-slate-500">Motivo</dt><dd className="mt-2 whitespace-pre-wrap font-medium text-slate-800">{display.reason || 'Sin motivo indicado.'}</dd></div>
    </dl>

    {display.status === 'draft' && <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h2 className="font-semibold text-slate-800">Enviar para revisión</h2>
      <p className="mt-1 text-sm text-slate-600">Una solicitud enviada ya no podrá modificarse desde este flujo.</p>
      {!submissionEnabled && <p className="mt-3 text-sm text-slate-600">El envío permanece deshabilitado hasta que la autorización de seguridad sea aplicada y validada.</p>}
      {submissionError && <p role="alert" className="mt-3 text-sm text-rose-700">{submissionError}</p>}
      <button type="button" disabled={!canSubmit || submissionState === 'submitting'} onClick={handleSubmit} className="mt-4 rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50">
        {submissionState === 'submitting' ? 'Enviando…' : 'Enviar solicitud'}
      </button>
      {submissionState === 'submitted' && <p className="mt-3 text-sm text-emerald-700">Solicitud enviada para revisión.</p>}
    </section>}

    <p className="mt-8 text-xs leading-5 text-slate-500">Las acciones de aprobación, rechazo y cancelación estarán disponibles en una fase posterior.</p>
  </article>
}

export default LeaveRequestDetailPage
