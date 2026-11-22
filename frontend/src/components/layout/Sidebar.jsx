import { NavLink } from 'react-router'
import { useRequestsManagePermission } from '../../features/leaveRequests/useRequestsManagePermission.js'
import { usePermission } from '../../features/employees/usePermission.js'

function buildGroups({ canManageRequests, canReadReports, canManageDocuments }) {
  const general = [
    { label: 'Chat IA', icon: '✦', to: '/chat' },
    { label: 'Políticas', icon: '▤', to: '/politicas' },
    { label: 'Solicitudes', icon: '□', to: '/solicitudes' },
  ]
  if (canManageRequests) general.push({ label: 'Gestión de solicitudes', icon: '▣', to: '/gestion-solicitudes', indent: true })
  const groups = [{ title: 'General', items: general }]
  if (canReadReports) groups.push({ title: 'Recursos Humanos', items: [{ label: 'Dashboard', icon: '◦', to: '/dashboard' }, { label: 'Reportes', icon: '◫', to: '/reportes' }] })
  if (canManageDocuments) groups.push({ title: 'Administración', items: [{ label: 'Documentos', icon: '▱', to: '/documentos' }] })
  return groups
}

function Sidebar() {
  const { allowed: canManageRequests } = useRequestsManagePermission()
  const canReadReports = usePermission('reports.read')
  const canManageDocuments = usePermission('documents.manage')
  const groups = buildGroups({ canManageRequests, canReadReports, canManageDocuments })

  return <aside className="border-b border-slate-200 bg-white lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-b-0"><div className="flex items-center gap-3 px-5 py-5 lg:px-6"><div className="flex size-9 items-center justify-center rounded-lg bg-[#0f4c5c] text-xs font-bold text-white" aria-hidden="true">RH</div><div><p className="text-sm font-semibold text-slate-900">Portal RRHH</p><p className="text-xs text-slate-500">RAG Multiagente</p></div></div><nav aria-label="Navegación principal" className="border-t border-slate-100 px-3 py-3 lg:flex-1 lg:px-4 lg:py-5"><div className="flex gap-5 overflow-x-auto pb-1 lg:block lg:space-y-6 lg:overflow-visible">{groups.map((group) => <section key={group.title} aria-labelledby={`nav-${group.title}`} className="min-w-40 lg:min-w-0"><h2 id={`nav-${group.title}`} className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{group.title}</h2><ul className="space-y-1">{group.items.map((item) => <li key={item.to} className={item.indent ? 'ml-4 border-l border-slate-200 pl-1' : undefined}><NavLink to={item.to} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2 ${isActive ? 'bg-[#e8f1f3] text-[#0f4c5c]' : 'text-slate-600 hover:bg-slate-50'}`}><span className="w-4 text-center" aria-hidden="true">{item.icon}</span>{item.label}</NavLink></li>)}</ul></section>)}</div></nav></aside>
}

export default Sidebar
