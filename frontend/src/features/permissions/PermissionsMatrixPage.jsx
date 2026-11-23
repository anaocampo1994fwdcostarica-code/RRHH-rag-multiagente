import PermissionGate from '../../components/PermissionGate.jsx'

const permissions = [
  ['employees.read', 'Consultar empleados', '—', '✓', '✓', '—'],
  ['employees.manage', 'Gestionar empleados, departamentos y puestos', '—', '✓', '✓', '—'],
  ['requests.manage', 'Gestionar solicitudes y tipos de permisos', '—', '✓', '✓', '—'],
  ['policies.manage', 'Gestionar políticas y versiones', '—', '✓', '✓', '—'],
  ['documents.manage', 'Gestionar documentos y sincronizaciones', '—', '✓', '✓', '—'],
  ['reports.read', 'Consultar reportes diarios e historial', '—', '✓', '✓', '✓'],
  ['reports.manage', 'Gestionar reportes administrativos', '—', '✓', '✓', '—'],
  ['audit.read', 'Consultar auditoría', '—', '—', '✓', '✓'],
  ['access.manage', 'Gestionar roles y permisos', '—', '—', '✓', '—'],
]

function MatrixContent() {
  return <div className="mx-auto max-w-7xl"><section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f4c5c]">Control de acceso</p><h2 className="mt-1 text-xl font-semibold text-slate-900">Matriz de permisos</h2><p className="mt-1 text-sm text-slate-500">Permisos asignados a cada rol del portal RRHH.</p><div className="mt-5 overflow-x-auto rounded-lg border border-slate-200" role="region" aria-label="Matriz de permisos" tabIndex={0}><table className="min-w-[760px] w-full text-left text-sm"><caption className="sr-only">Permisos por rol del sistema</caption><thead className="bg-slate-50 text-slate-600"><tr><th className="px-4 py-3">Permiso</th><th className="px-4 py-3">Descripción</th><th className="px-4 py-3 text-center">Empleado</th><th className="px-4 py-3 text-center">RRHH</th><th className="px-4 py-3 text-center">Administrador</th><th className="px-4 py-3 text-center">Auditor</th></tr></thead><tbody>{permissions.map(([code, description, employee, hr, admin, auditor]) => <tr key={code} className="border-t border-slate-100"><th scope="row" className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-[#0f4c5c]">{code}</th><td className="px-4 py-3 text-slate-700">{description}</td>{[employee, hr, admin, auditor].map((value, index) => <td key={`${code}-${index}`} className={`px-4 py-3 text-center font-semibold ${value === '✓' ? 'text-emerald-700' : 'text-slate-400'}`}>{value}</td>)}</tr>)}</tbody></table></div><p className="mt-4 text-xs text-slate-500">✓ Concedido por el rol · — No concedido. El acceso a datos propios también se controla mediante RLS.</p></section></div>
}

export default function PermissionsMatrixPage() { return <PermissionGate permission="access.manage"><MatrixContent /></PermissionGate> }
