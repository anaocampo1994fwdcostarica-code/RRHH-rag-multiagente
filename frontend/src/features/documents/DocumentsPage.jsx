import { useCallback, useState } from 'react'
import AccessDenied from '../../components/AccessDenied.jsx'
import PermissionGate from '../../components/PermissionGate.jsx'
import { ErrorBlock, LoadingBlock } from '../../components/StatusBlocks.jsx'
import { classifyApiError, formatCount, formatDateTimeCostaRica, getDocumentStatusLabel, getDocumentStatusStyle, getSafeExternalUrl, getSyncErrorMessage, getSyncKindLabel, getSyncStatusLabel, summarizeSyncResult } from '../reports/reportPresentation.js'
import { useApiResource } from '../reports/useApiResource.js'
import { getLastDocumentSync, listDocuments, requestDocumentSync } from './documentsApi.js'

const head = 'whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-600'

function SyncCard({ sync }) {
  if (!sync) return <section aria-labelledby="sync-title" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><h3 id="sync-title" className="font-semibold text-slate-900">Última sincronización</h3><p className="mt-2 text-sm text-slate-600">Aún no se ha ejecutado ninguna sincronización.</p></section>
  const counters = [['Revisados', sync.examined], ['Creados', sync.created], ['Actualizados', sync.updated], ['Archivados', sync.archived], ['Con error', sync.failed]]
  const tone = sync.status === 'failed' ? 'bg-rose-100 text-rose-900' : sync.status === 'started' ? 'bg-sky-100 text-sky-900' : 'bg-emerald-100 text-emerald-900'
  return <section aria-labelledby="sync-title" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center gap-2"><h3 id="sync-title" className="font-semibold text-slate-900">Última sincronización</h3><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>{getSyncStatusLabel(sync.status)}</span></div><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3"><div><dt className="text-xs text-slate-600">Inicio</dt><dd className="text-slate-900">{formatDateTimeCostaRica(sync.startedAt)}</dd></div><div><dt className="text-xs text-slate-600">Fin</dt><dd className="text-slate-900">{sync.finishedAt ? formatDateTimeCostaRica(sync.finishedAt) : '—'}</dd></div><div><dt className="text-xs text-slate-600">Tipo</dt><dd className="text-slate-900">{getSyncKindLabel(sync.kind)}</dd></div></dl><dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">{counters.map(([label, value]) => <div key={label} className="rounded-md bg-slate-50 p-2"><dt className="text-xs text-slate-600">{label}</dt><dd className="text-base font-semibold text-slate-900">{formatCount(value)}</dd></div>)}</dl>{sync.errorMessage ? <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-900">Error: {sync.errorMessage}</p> : null}</section>
}

function DocumentsTable({ documents }) {
  if (!documents.length) return <p className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">No hay documentos registrados. Usa «Sincronizar ahora» para traerlos desde Drive.</p>
  return <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm" tabIndex={0} role="region" aria-label="Tabla de documentos"><table className="w-full min-w-[760px] text-left text-sm"><caption className="sr-only">Catálogo de documentos sincronizados desde Drive</caption><thead className="bg-slate-50"><tr><th scope="col" className={head}>Código</th><th scope="col" className={head}>Título</th><th scope="col" className={head}>Formato</th><th scope="col" className={head}>Versión</th><th scope="col" className={head}>Estado</th><th scope="col" className={head}>Drive</th></tr></thead><tbody>{documents.map((doc) => { const url = getSafeExternalUrl(doc.driveUrl); return <tr key={doc.id} className="border-t border-slate-100"><td className="whitespace-nowrap px-3 py-3 text-slate-700">{doc.code ?? '—'}</td><th scope="row" className="px-3 py-3 font-medium text-slate-900">{doc.title}</th><td className="px-3 py-3 uppercase text-slate-700">{doc.format ?? '—'}</td><td className="px-3 py-3 text-slate-700">{doc.version ?? '—'}</td><td className="px-3 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${getDocumentStatusStyle(doc.status)}`}>{getDocumentStatusLabel(doc.status)}</span></td><td className="whitespace-nowrap px-3 py-3">{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="rounded font-medium text-[#0f4c5c] underline outline-none focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2">Abrir en Drive<span className="sr-only"> ({doc.title}, se abre en una pestaña nueva)</span></a> : <span className="text-slate-500">—</span>}</td></tr> })}</tbody></table></div>
}

function DocumentsContent() {
  const [reload, setReload] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const loadDocuments = useCallback(() => listDocuments(), [])
  const loadSync = useCallback(() => getLastDocumentSync(), [])
  const documents = useApiResource(loadDocuments, reload)
  const lastSync = useApiResource(loadSync, reload)

  async function runSync() {
    setSyncing(true)
    setFeedback(null)
    try {
      const result = await requestDocumentSync()
      setFeedback(summarizeSyncResult(result))
    } catch (error) {
      setFeedback({ tone: 'error', message: getSyncErrorMessage(error) })
    } finally {
      setSyncing(false)
      setReload((value) => value + 1)
    }
  }

  if (documents.status === 'error' && classifyApiError(documents.error) === 'forbidden') return <AccessDenied />
  const syncEnabled = lastSync.status !== 'ready' || lastSync.data?.syncEnabled !== false
  const feedbackStyle = { success: 'border-emerald-200 bg-emerald-50 text-emerald-900', warning: 'border-amber-200 bg-amber-50 text-amber-950', error: 'border-rose-200 bg-rose-50 text-rose-900' }

  let table
  if (documents.status === 'loading') table = <LoadingBlock label="Cargando documentos…" />
  else if (documents.status === 'error') table = <ErrorBlock message="No fue posible cargar los documentos." onRetry={() => setReload((value) => value + 1)} />
  else table = <DocumentsTable documents={Array.isArray(documents.data?.data) ? documents.data.data : []} />

  return <div className="mx-auto max-w-7xl space-y-6"><section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-2xl"><h2 className="text-lg font-semibold text-slate-900">Documentos de Recursos Humanos</h2><p className="mt-1 text-sm text-slate-600">Catálogo sincronizado desde Google Drive. Un documento procesado no se publica automáticamente para el chat.</p></div><button type="button" onClick={runSync} disabled={syncing || !syncEnabled} aria-describedby="sync-help" className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c5c] px-4 py-2.5 text-sm font-medium text-white outline-none hover:bg-[#0c3d4a] focus-visible:ring-2 focus-visible:ring-[#0f4c5c] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-600">{syncing ? <><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />Sincronizando…</> : 'Sincronizar ahora'}</button></div><p id="sync-help" className="mt-3 text-sm text-slate-600">{!syncEnabled ? 'La sincronización con Drive está desactivada en este entorno; el catálogo se muestra tal como está.' : syncing ? 'La sincronización puede tardar varios minutos. Puedes seguir en esta página.' : 'Trae los documentos nuevos o modificados desde Drive.'}</p><div aria-live="polite">{feedback ? <p role={feedback.tone === 'error' ? 'alert' : 'status'} className={`mt-4 rounded-md border p-3 text-sm ${feedbackStyle[feedback.tone]}`}>{feedback.message}</p> : null}</div></section>{lastSync.status === 'ready' ? <SyncCard sync={lastSync.data?.data ?? null} /> : lastSync.status === 'loading' ? <LoadingBlock label="Cargando última sincronización…" /> : <ErrorBlock message="No fue posible cargar la última sincronización." />}{table}</div>
}

function DocumentsPage() {
  return <PermissionGate permission="documents.manage"><DocumentsContent /></PermissionGate>
}

export default DocumentsPage
