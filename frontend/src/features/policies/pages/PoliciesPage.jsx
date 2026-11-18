import { useEffect, useMemo, useState } from 'react'
import { ApiError } from '../../../api/client.js'
import PolicyCard from '../components/PolicyCard.jsx'
import { listPolicies } from '../policiesApi.js'

function PoliciesPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState({ data: [], total: 0, limit: 20 })
  const [state, setState] = useState('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    listPolicies({ q: query, category, page, limit: 20 })
      .then((response) => { if (!cancelled) { setResult(response); setState('ready') } })
      .catch((requestError) => { if (!cancelled) { setError(requestError instanceof ApiError ? requestError.message : 'No fue posible cargar las políticas.'); setState('error') } })
    return () => { cancelled = true }
  }, [category, page, query])

  const categories = useMemo(() => ['Todas', ...new Set(result.data.map((policy) => policy.category))], [result.data])
  const pageCount = Math.max(1, Math.ceil(result.total / result.limit))
  const resetFilters = () => { setQuery(''); setCategory(''); setPage(1) }

  return <div className="mx-auto max-w-7xl">
    <section aria-labelledby="policies-title" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><h1 id="policies-title" className="text-2xl font-semibold tracking-tight text-slate-900">Políticas de Recursos Humanos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Consulta metadatos y resúmenes de políticas visibles para tu sesión. El contenido completo no está disponible en esta etapa.</p><div className="mt-6 grid gap-4 lg:grid-cols-4"><label className="block lg:col-span-3"><span className="mb-1.5 block text-sm font-medium text-slate-700">Buscar políticas</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} type="search" placeholder="Busca por título" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#0f4c5c] focus:ring-2 focus:ring-[#0f4c5c]/20" /></label><label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Categoría</span><select value={category} onChange={(event) => { setCategory(event.target.value); setPage(1) }} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#0f4c5c] focus:ring-2 focus:ring-[#0f4c5c]/20">{categories.map((item) => <option key={item} value={item === 'Todas' ? '' : item}>{item}</option>)}</select></label></div></section>
    <div className="mt-6 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-800">Resultados</h2>{state === 'ready' && <p className="text-sm text-slate-500">{result.total} {result.total === 1 ? 'política' : 'políticas'}</p>}</div>
    {state === 'loading' && <p className="mt-4 rounded-lg bg-white p-6 text-sm text-slate-500">Cargando políticas…</p>}
    {state === 'error' && <section className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800"><p>{error}</p><button type="button" onClick={resetFilters} className="mt-3 rounded bg-white px-3 py-2 font-medium">Limpiar filtros</button></section>}
    {state === 'ready' && (result.data.length ? <><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{result.data.map((policy) => <PolicyCard key={policy.id} policy={policy} />)}</div><nav aria-label="Paginación de políticas" className="mt-6 flex items-center justify-center gap-3"><button type="button" disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Anterior</button><span className="text-sm text-slate-600">Página {page} de {pageCount}</span><button type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)} className="rounded border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Siguiente</button></nav></> : <section className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-base font-semibold text-slate-800">No encontramos políticas</h2><button type="button" onClick={resetFilters} className="mt-4 rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white">Limpiar filtros</button></section>)}
  </div>
}

export default PoliciesPage
