import { Link } from 'react-router'
import { formatEffectiveFrom, formatVersion } from '../policyUtils.js'
import DriveLink from './DriveLink.jsx'

// Vista móvil de una política (en pantallas md+ se usa la tabla).
function PolicyCard({ policy }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-slate-500">{policy.code}</span><span className="rounded bg-[#e8f1f3] px-2 py-1 text-xs font-medium text-[#0f4c5c]">{policy.category}</span></div>
    <h3 className="mt-2 text-base font-semibold text-slate-800"><Link to={`/politicas/${policy.slug}`} className="text-[#0f4c5c] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0f4c5c]">{policy.title}</Link></h3>
    <p className="mt-2 text-sm text-slate-600">Versión {formatVersion(policy)} · Vigente desde {formatEffectiveFrom(policy.effectiveFrom)}</p>
    <div className="mt-4"><DriveLink policy={policy} /></div>
  </article>
}

export default PolicyCard
