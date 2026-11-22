import { Link } from 'react-router'

function AccessDenied({ message = 'Acceso restringido: este panel es solo para Recursos Humanos' }) {
  return <section role="alert" className="mx-auto max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-8 text-center"><span className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-100 text-lg text-amber-900" aria-hidden="true">!</span><h2 className="mt-4 text-lg font-semibold text-amber-950">{message}</h2><p className="mt-2 text-sm text-amber-900">Si necesitas esta información, consulta al equipo de Recursos Humanos.</p><Link to="/chat" className="mt-5 inline-flex rounded-lg bg-[#0f4c5c] px-4 py-2.5 text-sm font-medium text-white outline-none hover:bg-[#0c3d4a] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Ir al Chat IA</Link></section>
}

export default AccessDenied
