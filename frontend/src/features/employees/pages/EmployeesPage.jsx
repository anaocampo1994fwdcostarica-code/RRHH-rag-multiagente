import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { listEmployees } from '../employeesApi.js'

function EmployeesPage() {
  const [result, setResult] = useState({ data: [], total: 0, limit: 20 })
  const [state, setState] = useState('loading')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let active = true
    listEmployees({ page, limit: 20 })
      .then((nextResult) => {
        if (active) {
          setResult(nextResult)
          setState('ready')
        }
      })
      .catch(() => active && setState('error'))
    return () => { active = false }
  }, [page])

  const rows = useMemo(() => result.data.filter((employee) => `${employee.employeeCode} ${employee.displayName ?? ''} ${employee.department ?? ''}`.toLowerCase().includes(query.toLowerCase())), [result.data, query])

  if (state === 'loading') return <p className="rounded-lg bg-white p-6 text-sm text-slate-500">Cargando empleados…</p>
  if (state === 'error') return <p className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">No fue posible cargar los empleados.</p>

  return <div className="mx-auto max-w-7xl"><section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-2xl font-semibold">Gestión de empleados</h1><p className="mt-2 text-sm text-slate-600">Consulta los empleados autorizados para tu sesión.</p><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por código, nombre o departamento" className="mt-5 w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm" /></section>{rows.length ? <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Código</th><th className="p-3">Nombre</th><th className="p-3">Departamento</th><th className="p-3">Puesto</th><th className="p-3">Estado</th><th className="p-3" /></tr></thead><tbody>{rows.map((employee) => <tr key={employee.id} className="border-t"><td className="p-3">{employee.employeeCode}</td><td className="p-3 font-medium">{employee.displayName ?? 'Nombre no disponible'}</td><td className="p-3">{employee.department ?? 'No disponible'}</td><td className="p-3">{employee.position ?? 'No disponible'}</td><td className="p-3">{employee.employmentStatus}</td><td className="p-3 text-right"><Link to={`/empleados/${employee.id}`} className="text-[#0f4c5c]">Ver detalle</Link></td></tr>)}</tbody></table></div> : <p className="mt-6 rounded-lg bg-white p-8 text-center">No hay empleados para esta búsqueda.</p>}<div className="mt-5 flex justify-center gap-3"><button disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * result.limit >= result.total} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></div>
}

export default EmployeesPage
