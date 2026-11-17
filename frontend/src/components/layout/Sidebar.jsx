const navigationItems = [
  { label: 'Dashboard', icon: '▦', available: true },
  { label: 'Chat IA', icon: '◌', available: false },
  { label: 'Políticas', icon: '▤', available: false },
  { label: 'Reportes', icon: '▥', available: false },
  { label: 'Solicitudes', icon: '□', available: false },
  { label: 'Configuración', icon: '⚙', available: false },
]

function Sidebar() {
  return (
    <aside className="bg-slate-900 text-slate-100 lg:flex lg:w-72 lg:shrink-0 lg:flex-col">
      <div className="flex items-center gap-3 px-5 py-5 lg:px-6">
        <div className="flex size-10 items-center justify-center rounded-lg bg-cyan-500 text-lg font-bold text-slate-950" aria-hidden="true">
          RH
        </div>
        <div>
          <p className="text-sm font-semibold tracking-wide text-white">Portal RRHH</p>
          <p className="text-xs text-slate-400">RAG Multiagente</p>
        </div>
      </div>

      <nav aria-label="Navegación principal" className="border-t border-slate-800 px-3 py-3 lg:flex-1 lg:px-4 lg:py-5">
        <ul className="flex gap-1 overflow-x-auto lg:flex-col">
          {navigationItems.map((item) => (
            <li key={item.label} className="shrink-0 lg:w-full">
              {item.available ? (
                <a
                  href="#dashboard"
                  aria-current="page"
                  className="flex items-center gap-3 rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-medium text-white outline-none transition hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-cyan-300"
                >
                  <span className="w-4 text-center text-cyan-300" aria-hidden="true">{item.icon}</span>
                  {item.label}
                </a>
              ) : (
                <span className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-400" aria-label={`${item.label}: próximamente`}>
                  <span className="w-4 text-center" aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                  <span className="ml-auto rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">Próximamente</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <p className="hidden border-t border-slate-800 px-6 py-4 text-xs leading-5 text-slate-400 lg:block">
        Entorno de demostración. Sin datos reales de empleados.
      </p>
    </aside>
  )
}

export default Sidebar
