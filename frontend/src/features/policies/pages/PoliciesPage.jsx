import { useMemo, useState } from 'react'
import PolicyCard from '../components/PolicyCard.jsx'
import { policies, policyCategories } from '../data/policies.js'

function PoliciesPage() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Todas')

  const filteredPolicies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('es')
    return policies.filter((policy) => {
      const matchesCategory = category === 'Todas' || policy.category === category
      const searchableText = `${policy.title} ${policy.category} ${policy.description}`.toLocaleLowerCase('es')
      return matchesCategory && searchableText.includes(normalizedQuery)
    })
  }, [category, query])

  return (
    <div className="mx-auto max-w-7xl">
      <section aria-labelledby="policies-title" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <span className="rounded bg-amber-100 px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-amber-800">Catálogo de demostración</span>
        <h1 id="policies-title" className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">Políticas de Recursos Humanos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Consulta registros ficticios para validar la navegación y el diseño. No son políticas oficiales ni documentos legales.</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-4">
          <label className="block lg:col-span-3"><span className="mb-1.5 block text-sm font-medium text-slate-700">Buscar políticas</span><input value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Ejemplo: vacaciones, horario o permisos" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-[#0f4c5c] focus:ring-2 focus:ring-[#0f4c5c]/20" /></label>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#0f4c5c] focus:ring-2 focus:ring-[#0f4c5c]/20">{policyCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
      </section>

      <div className="mt-6 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-800">Resultados</h2><p className="text-sm text-slate-500">{filteredPolicies.length} {filteredPolicies.length === 1 ? 'política' : 'políticas'} de demostración</p></div>
      {filteredPolicies.length > 0 ? <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredPolicies.map((policy) => <PolicyCard key={policy.id} policy={policy} />)}</div> : <section className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-base font-semibold text-slate-800">No encontramos políticas</h2><p className="mt-2 text-sm text-slate-500">Prueba con otro término o selecciona una categoría diferente.</p><button type="button" onClick={() => { setQuery(''); setCategory('Todas') }} className="mt-4 rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white outline-none hover:bg-[#0b3c49] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Limpiar filtros</button></section>}
    </div>
  )
}

export default PoliciesPage
