import { Link } from 'react-router'

function PolicyCard({ policy }) {
  return (
    <article className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <span className="w-fit rounded bg-[#e8f1f3] px-2 py-1 text-xs font-medium text-[#0f4c5c]">{policy.category}</span>
      <h2 className="mt-4 text-base font-semibold text-slate-800">{policy.title}</h2>
      <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{policy.description}</p>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <span className="text-xs text-slate-400">Actualización simulada: {policy.updatedAt}</span>
        <Link to={`/politicas/${policy.id}`} className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-[#0f4c5c] outline-none hover:bg-[#e8f1f3] focus-visible:ring-2 focus-visible:ring-[#0f4c5c]">Ver detalle<span aria-hidden="true"> →</span></Link>
      </div>
    </article>
  )
}

export default PolicyCard
