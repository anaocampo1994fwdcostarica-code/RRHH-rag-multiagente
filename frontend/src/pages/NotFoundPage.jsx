import { Link } from 'react-router'

function NotFoundPage() {
  return <section className="mx-auto max-w-xl rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center"><p className="text-sm font-semibold text-[#0f4c5c]">Error 404</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Página no encontrada</h1><p className="mt-2 text-sm text-slate-500">La dirección solicitada no forma parte del portal.</p><Link to="/" className="mt-5 inline-flex rounded-lg bg-[#0f4c5c] px-4 py-2 text-sm font-medium text-white outline-none hover:bg-[#0b3c49] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Ir al dashboard</Link></section>
}

export default NotFoundPage
