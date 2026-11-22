import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '../../../api/client.js'
import { ErrorBlock, LoadingBlock } from '../../../components/StatusBlocks.jsx'
import DriveLink from '../components/DriveLink.jsx'
import PolicyCard from '../components/PolicyCard.jsx'
import { listPolicies } from '../policiesApi.js'
import { CATEGORIES, formatEffectiveFrom, formatVersion } from '../policyUtils.js'

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#0f4c5c] focus:ring-2 focus:ring-[#0f4c5c]/20'

function PoliciesPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [policies, setPolicies] = useState([])
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    // Debounce breve para no consultar en cada pulsación.
    const timer = setTimeout(() => {
      setState('loading')
      listPolicies({ q: query.trim(), category, page: 1, limit: 50 })
        .then((response) => { if (!cancelled) { setPolicies(response.data); setState('ready') } })
        .catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar las políticas.'); setState('error') } })
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, category, attempt])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])
  const resetFilters = () => { setQuery(''); setCategory('') }

  return <div className="mx-auto max-w-7xl">
    <section aria-labelledby="policies-title" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h1 id="policies-title" className="text-2xl font-semibold tracking-tight text-slate-900">Políticas de Recursos Humanos</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Políticas vigentes publicadas desde Google Drive. El asistente del Chat IA responde con base en estos documentos.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm font-medium text-slate-700">Buscar por título o código</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Título o código de la política" className={fieldClass} /></label>
        <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)} className={fieldClass}><option value="">Todas</option>{CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>
    </section>

    <div className="mt-6 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-800">Resultados</h2>{state === 'ready' && <p className="text-sm text-slate-500" aria-live="polite">{policies.length} {policies.length === 1 ? 'política' : 'políticas'}</p>}</div>

    <div className="mt-4">
      {state === 'loading' && <LoadingBlock label="Cargando políticas…" />}
      {state === 'error' && <ErrorBlock message={error} onRetry={retry} />}
      {state === 'ready' && (policies.length === 0
        ? <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h3 className="text-base font-semibold text-slate-800">No encontramos políticas</h3><p className="mt-1 text-sm text-slate-500">Prueba con otra búsqueda o categoría.</p><button type="button" onClick={resetFilters} className="mt-4 rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white outline-none focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Limpiar filtros</button></section>
        : <>
          <div className="grid gap-3 md:hidden">{policies.map((policy) => <PolicyCard key={policy.slug} policy={policy} />)}</div>
          <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Políticas vigentes</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th scope="col" className="px-4 py-3 font-medium">Código</th><th scope="col" className="px-4 py-3 font-medium">Título</th><th scope="col" className="px-4 py-3 font-medium">Categoría</th><th scope="col" className="px-4 py-3 font-medium">Versión</th><th scope="col" className="px-4 py-3 font-medium">Vigente desde</th><th scope="col" className="px-4 py-3 font-medium">Documento</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{policies.map((policy) => <tr key={policy.slug}>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{policy.code}</td>
                <td className="px-4 py-3 font-medium"><Link to={`/politicas/${policy.slug}`} className="text-[#0f4c5c] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0f4c5c]">{policy.title}</Link></td>
                <td className="px-4 py-3"><span className="rounded bg-[#e8f1f3] px-2 py-1 text-xs font-medium text-[#0f4c5c]">{policy.category}</span></td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatVersion(policy)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatEffectiveFrom(policy.effectiveFrom)}</td>
                <td className="px-4 py-3"><DriveLink policy={policy} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </>)}
    </div>
  </div>
}

export default PoliciesPage
