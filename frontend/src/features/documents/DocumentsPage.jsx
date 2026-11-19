import { useEffect, useState } from 'react'
import { usePermission } from '../employees/usePermission.js'
import { listDocuments } from './documentsApi.js'

function DocumentsPage() {
  const allowed = usePermission('documents.manage')
  const [state, setState] = useState('loading')
  const [result, setResult] = useState({ data: [], total: 0, limit: 20 })
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (!allowed) return
    let active = true
    listDocuments({ page }).then((nextResult) => {
      if (active) { setResult(nextResult); setState('ready') }
    }).catch(() => active && setState('error'))
    return () => { active = false }
  }, [allowed, page])

  if (!allowed) return <p className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">No tienes permiso para gestionar documentos.</p>
  if (state === 'loading') return <p className="rounded-lg bg-white p-6 text-sm text-slate-500">Cargando documentos…</p>
  if (state === 'error') return <p className="rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">No fue posible cargar los documentos.</p>

  return <div className="mx-auto max-w-7xl"><section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold">Gestión de documentos</h1><p className="mt-2 text-sm text-slate-600">Catálogo administrativo. Un documento procesado no se publica automáticamente para el chat.</p></div><button disabled className="rounded bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500" title="La sincronización requiere validación remota previa">Sincronización pendiente de activación</button></div></section>{result.data.length ? <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[900px] w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Documento</th><th className="p-3">Tipo</th><th className="p-3">Estado editorial</th><th className="p-3">Procesamiento</th><th className="p-3">Política vinculada</th><th className="p-3">Actualizado</th></tr></thead><tbody>{result.data.map((document) => <tr key={document.id} className="border-t"><td className="p-3 font-medium">{document.title}</td><td className="p-3">{document.mimeType ?? 'No disponible'}</td><td className="p-3">{document.status}</td><td className="p-3">{document.processingStatus ?? 'Pendiente'}{document.processingError ? <p className="mt-1 text-xs text-rose-700">Error de procesamiento registrado</p> : null}</td><td className="p-3">{document.policy?.title ?? 'Sin política vinculada'}</td><td className="p-3">{document.updatedAt ?? 'No disponible'}</td></tr>)}</tbody></table></div> : <p className="mt-6 rounded-lg bg-white p-8 text-center">No hay documentos visibles para tu permiso.</p>}<div className="mt-5 flex justify-center gap-3"><button disabled={page === 1} onClick={() => setPage((current) => current - 1)}>Anterior</button><span>Página {page}</span><button disabled={page * result.limit >= result.total} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></div>
}

export default DocumentsPage
