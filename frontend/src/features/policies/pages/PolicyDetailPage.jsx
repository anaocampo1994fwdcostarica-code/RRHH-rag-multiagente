import { Link, useParams } from 'react-router'
import { getPolicyById } from '../data/policies.js'

function PolicyDetailPage() {
  const { id } = useParams()
  const policy = getPolicyById(id)

  if (!policy) {
    return <section className="mx-auto max-w-3xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><h1 className="text-xl font-semibold text-slate-900">Política no encontrada</h1><p className="mt-2 text-sm text-slate-500">El identificador solicitado no existe en este catálogo de demostración.</p><Link to="/politicas" className="mt-5 inline-flex rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white outline-none hover:bg-[#0b3c49] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Volver al catálogo</Link></section>
  }

  return <article className="mx-auto max-w-4xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><Link to="/politicas" className="text-sm font-medium text-[#0f4c5c] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[#0f4c5c]">← Volver a políticas</Link><div className="mt-6 border-b border-slate-100 pb-6"><span className="rounded bg-[#e8f1f3] px-2 py-1 text-xs font-medium text-[#0f4c5c]">{policy.category}</span><h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">{policy.title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{policy.description}</p></div><div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Documento de demostración.</strong> Esta vista no está conectada a Google Drive ni representa una fuente oficial.</div><section aria-labelledby="content-title" className="mt-7"><h2 id="content-title" className="text-base font-semibold text-slate-800">Contenido ilustrativo</h2><div className="mt-3 space-y-4 text-sm leading-7 text-slate-600">{policy.content.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div></section><dl className="mt-8 grid gap-4 border-t border-slate-100 pt-5 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Fecha de actualización</dt><dd className="mt-1 font-medium text-slate-800">{policy.updatedAt} · simulada</dd></div><div><dt className="text-slate-500">Estado de fuente</dt><dd className="mt-1 font-medium text-slate-800">Documento de demostración, no conectado</dd></div></dl></article>
}

export default PolicyDetailPage
