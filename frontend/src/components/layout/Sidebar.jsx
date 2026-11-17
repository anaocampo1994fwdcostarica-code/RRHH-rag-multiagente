import { NavLink } from 'react-router'

const groups = [
  { title: 'General', items: [{ label: 'Dashboard', icon: '▦', to: '/' }, { label: 'Chat IA', icon: '✦' }, { label: 'Políticas', icon: '▤', to: '/politicas' }] },
  { title: 'Gestión RRHH', items: [{ label: 'Empleados', icon: '◉' }, { label: 'Solicitudes', icon: '□' }, { label: 'Reportes', icon: '◫' }] },
  { title: 'Administración', items: [{ label: 'Documentos', icon: '▱' }, { label: 'Configuración', icon: '⚙' }] },
]

function Sidebar() {
  return (
    <aside className="border-b border-slate-200 bg-white lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0">
      <div className="flex items-center gap-3 px-5 py-5 lg:px-6"><div className="flex size-9 items-center justify-center rounded-lg bg-[#0f4c5c] text-xs font-bold text-white" aria-hidden="true">RH</div><div><p className="text-sm font-semibold text-slate-900">Portal RRHH</p><p className="text-xs text-slate-500">RAG Multiagente</p></div></div>
      <nav aria-label="Navegación principal" className="border-t border-slate-100 px-3 py-3 lg:flex-1 lg:px-4 lg:py-5"><div className="flex gap-5 overflow-x-auto pb-1 lg:block lg:space-y-6 lg:overflow-visible">{groups.map((group) => <section key={group.title} aria-labelledby={`nav-${group.title}`} className="min-w-40 lg:min-w-0"><h2 id={`nav-${group.title}`} className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{group.title}</h2><ul className="space-y-1">{group.items.map((item) => <li key={item.label}>{item.to ? <NavLink to={item.to} end={item.to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2 ${isActive ? 'bg-[#e8f1f3] text-[#0f4c5c]' : 'text-slate-600 hover:bg-slate-50'}`}><span className="w-4 text-center" aria-hidden="true">{item.icon}</span>{item.label}</NavLink> : <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-500" aria-label={`${item.label}: módulo pendiente`}><span className="w-4 text-center" aria-hidden="true">{item.icon}</span><span>{item.label}</span><span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-400">Pendiente</span></span>}</li>)}</ul></section>)}</div></nav>
      <p className="hidden border-t border-slate-100 px-6 py-4 text-xs leading-5 text-slate-500 lg:block">Entorno de demostración. No contiene información real de empleados.</p>
    </aside>
  )
}

export default Sidebar
