import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { createLeaveRequest, listLeaveTypes } from '../leaveRequestsApi.js'
import { validateDraftRequest } from '../validation.js'

const initialForm = { leaveTypeId: '', startDate: '', endDate: '', reason: '' }

function NewLeaveRequestPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [leaveTypes, setLeaveTypes] = useState([])
  const [loadingTypes, setLoadingTypes] = useState(true)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { let cancelled = false; listLeaveTypes({ limit: 50 }).then((response) => { if (!cancelled) { setLeaveTypes(response.data); setLoadingTypes(false) } }).catch((requestError) => { if (!cancelled) { setServerError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar los tipos de permiso.'); setLoadingTypes(false) } }); return () => { cancelled = true } }, [])
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event) => {
    event.preventDefault()
    const validationErrors = validateDraftRequest(form)
    setErrors(validationErrors)
    setServerError('')
    if (Object.keys(validationErrors).length) return
    setSubmitting(true)
    try {
      const response = await createLeaveRequest(form)
      navigate(`/solicitudes/${response.data.id}`, { replace: true })
    } catch (requestError) {
      setServerError(requestError instanceof ApiError ? requestError.message : 'No fue posible crear el borrador.')
      setSubmitting(false)
    }
  }

  return <div className="mx-auto max-w-3xl"><Link to="/solicitudes" className="text-sm font-medium text-[#0f4c5c]">← Volver a solicitudes</Link><form onSubmit={submit} className="mt-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold">Nueva solicitud</h1><p className="mt-2 text-sm text-slate-600">Se creará un borrador propio. No se enviará para aprobación en esta etapa.</p>{serverError && <p role="alert" className="mt-5 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{serverError}</p>}<div className="mt-6 space-y-5"><label className="block"><span className="mb-1 block text-sm font-medium">Tipo de permiso</span><select value={form.leaveTypeId} onChange={(event) => update('leaveTypeId', event.target.value)} disabled={loadingTypes} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="">{loadingTypes ? 'Cargando tipos…' : 'Selecciona una opción'}</option>{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.requiresAttachment ? ' (requiere adjunto)' : ''}</option>)}</select>{errors.leaveTypeId && <span className="mt-1 block text-xs text-rose-700">{errors.leaveTypeId}</span>}</label><div className="grid gap-5 sm:grid-cols-2"><label><span className="mb-1 block text-sm font-medium">Fecha inicial</span><input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />{errors.startDate && <span className="mt-1 block text-xs text-rose-700">{errors.startDate}</span>}</label><label><span className="mb-1 block text-sm font-medium">Fecha final</span><input type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />{errors.endDate && <span className="mt-1 block text-xs text-rose-700">{errors.endDate}</span>}</label></div><label className="block"><span className="mb-1 block text-sm font-medium">Motivo <span className="font-normal text-slate-500">(opcional)</span></span><textarea value={form.reason} maxLength={1000} onChange={(event) => update('reason', event.target.value)} rows="4" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />{errors.reason && <span className="mt-1 block text-xs text-rose-700">{errors.reason}</span>}</label></div><div className="mt-7 flex justify-end gap-3"><Link to="/solicitudes" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">Cancelar</Link><button type="submit" disabled={submitting || loadingTypes} className="rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? 'Creando…' : 'Crear borrador'}</button></div></form></div>
}

export default NewLeaveRequestPage
