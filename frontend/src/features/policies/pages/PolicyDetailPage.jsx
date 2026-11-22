import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { ErrorBlock, LoadingBlock } from '../../../components/StatusBlocks.jsx'
import DriveLink from '../components/DriveLink.jsx'
import { getPolicy } from '../policiesApi.js'
import { formatEffectiveFrom, formatVersion } from '../policyUtils.js'

const backClass = 'text-sm font-medium text-[#0f4c5c] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0f4c5c]'

function PolicyDetailPage() {
  const { id: slug } = useParams()
  const [policy, setPolicy] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    getPolicy(slug)
      .then((response) => { if (!cancelled) { setPolicy(response.data); setState('ready') } })
      .catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar la política.'); setState('error') } })
    return () => { cancelled = true }
  }, [slug, attempt])

  const retry = useCallback(() => { setState('loading'); setAttempt((current) => current + 1) }, [])

  if (state === 'loading') return <LoadingBlock label="Cargando política…" />
  if (state === 'error') return <div className="mx-auto max-w-3xl space-y-4"><ErrorBlock message={error} onRetry={retry} /><Link to="/politicas" className={backClass}>← Volver al catálogo</Link></div>

  const items = [
    ['Código', policy.code],
    ['Categoría', policy.category],
    ['Versión', formatVersion(policy)],
    ['Vigente desde', formatEffectiveFrom(policy.effectiveFrom)],
  ]
  return <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <Link to="/politicas" className={backClass}>← Volver al catálogo</Link>
    <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">{policy.title}</h1>
    <dl className="mt-6 grid gap-4 border-t border-slate-100 pt-6 text-sm sm:grid-cols-2">{items.map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 font-medium text-slate-800">{value}</dd></div>)}</dl>
    <div className="mt-8"><DriveLink policy={policy} /></div>
  </article>
}

export default PolicyDetailPage
