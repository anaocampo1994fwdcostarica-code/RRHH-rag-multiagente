import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { getPolicy } from '../policiesApi.js'

function PolicyDetailPage() {
  const { id: slug } = useParams()
  const [policy, setPolicy] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getPolicy(slug).then((response) => { if (!cancelled) { setPolicy(response.data); setState('ready') } }).catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar la política.'); setState('error') } })
    return () => { cancelled = true }
  }, [slug])

  if (state === 'loading') return <p className="mx-auto max-w-4xl rounded-lg bg-white p-6 text-sm text-slate-500">Cargando política…</p>
  if (state === 'error') return <section className="mx-auto max-w-3xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Política no disponible</h1><p className="mt-2 text-sm text-slate-500">{error}</p><Link to="/politicas" className="mt-5 inline-flex rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white">Volver al catálogo</Link></section>
  return <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><Link to="/politicas" className="text-sm font-medium text-[#0f4c5c] hover:underline">← Volver a políticas</Link><div className="mt-6 border-b border-slate-100 pb-6"><span className="rounded bg-[#e8f1f3] px-2 py-1 text-xs font-medium text-[#0f4c5c]">{policy.category}</span><h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{policy.title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{policy.summary || 'Sin resumen disponible.'}</p></div><section className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600"><h2 className="font-semibold text-slate-800">Alcance disponible</h2><p className="mt-1">Esta vista muestra únicamente metadatos y resumen. El contenido completo de la política no está disponible.</p></section><dl className="mt-8 text-sm"><dt className="text-slate-500">Última actualización</dt><dd className="mt-1 font-medium text-slate-800">{new Date(policy.updatedAt).toLocaleDateString('es-CR')}</dd></dl></article>
}

export default PolicyDetailPage
