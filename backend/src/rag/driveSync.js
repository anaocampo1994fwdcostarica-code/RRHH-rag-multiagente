// Ingesta completa e incremental (changes.list) de la carpeta de políticas en Google Drive.
// La usan npm run ingest:drive, npm run sync:drive (tarea diaria) y POST /admin/documents/sync.
import { supportedMimeTypes } from './googleDriveClient.js'

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const ARCHIVE_REASONS = Object.freeze({
  removed: 'Eliminado o en la papelera de Google Drive',
  moved: 'Movido fuera de la carpeta de políticas en Google Drive',
  missing: 'Ya no está en la carpeta de Google Drive',
})
// Freno de seguridad: una ingesta completa no archiva más de esta fracción de los documentos activos
// (p. ej. si GOOGLE_DRIVE_FOLDER_ID apunta por error a otra carpeta). Se puede forzar con allowMassArchive.
export const MAX_ARCHIVE_FRACTION = 0.3

async function knownDocuments(transaction, auth) {
  const rows = await transaction(auth, async (client) => (await client.query(
    `select external_id, title, document_status from public.documents where source_provider = 'google_drive'`)).rows)
  return new Map(rows.map((row) => [row.external_id, row]))
}

async function ingestSafely(ingestion, auth, file, known, note) {
  try {
    const result = await ingestion.ingestFile(auth, file, { note })
    const previous = known.get(file.id)
    if (result.outcome === 'unchanged' && previous && previous.title !== file.name) return { ...result, outcome: 'renamed', previousName: previous.title }
    return result
  } catch (error) {
    // permanent: error de contenido que se repetirá igual (sin código, sin texto); no bloquea el token.
    return { externalId: file.id, name: file.name, outcome: 'failed', error: error.message, permanent: error.permanent === true }
  }
}

async function archiveSafely(ingestion, auth, document, reason) {
  try {
    return (await ingestion.archiveByExternalId(auth, document.external_id, reason))
      ? { externalId: document.external_id, name: document.title, outcome: 'archived', reason }
      : null
  } catch (error) {
    return { externalId: document.external_id, name: document.title, outcome: 'failed', error: error.message }
  }
}

/**
 * Decide qué hacer con cada cambio de changes.list (función pura, probada aparte).
 * Un archivo está "en la carpeta" si no fue eliminado ni enviado a la papelera, su tipo es soportado y
 * alguno de sus padres es la carpeta raíz o una subcarpeta (folders: Map id -> ruta).
 */
export function classifyChange(change, folders, known) {
  const file = change.file
  const document = known.get(change.fileId)
  const gone = change.removed || !file || file.trashed
  const parent = !gone ? (file.parents ?? []).find((id) => folders.has(id)) : undefined
  if (parent && supportedMimeTypes.has(file.mimeType)) return { action: 'ingest', folderPath: folders.get?.(parent) ?? null }
  if (document && document.document_status !== 'archived') return { action: 'archive', reason: gone ? ARCHIVE_REASONS.removed : ARCHIVE_REASONS.moved }
  return { action: 'ignore' }
}

/**
 * changes.list informa el cambio de una carpeta, pero no el de cada archivo que contiene. Si una carpeta se
 * movió, renombró o eliminó, o desapareció algo que no es un documento conocido (puede ser una carpeta),
 * se hace una reconciliación completa.
 */
export function needsFullReconciliation(changes, known) {
  return [...changes].some((change) => change.file?.mimeType === FOLDER_MIME || (change.removed && !known.has(change.fileId)))
}

export function createDriveSync({ drive, ingestion, transaction, folderId, allowMassArchive = false }) {
  if (!drive || !ingestion || typeof transaction !== 'function' || !folderId) throw new TypeError('Drive sync requires drive, ingestion, transaction and folderId.')

  async function finish(auth, runId, results, tokenAfter) {
    const failed = results.some((result) => result.outcome === 'failed')
    // Solo los fallos transitorios (red, base de datos) detienen el token: la próxima ejecución los reintenta
    // (la ingesta es idempotente). Los permanentes se reportan pero no bloquean la sincronización para siempre.
    const blocking = results.some((result) => result.outcome === 'failed' && !result.permanent)
    if (!blocking && tokenAfter) await ingestion.saveStartPageToken(auth, folderId, tokenAfter)
    await ingestion.finishRun(auth, runId, { failed, results, tokenAfter: blocking ? null : tokenAfter })
    return { runId, failed, results, tokenSaved: !blocking && Boolean(tokenAfter) }
  }

  async function full(auth, { reason = null } = {}) {
    const startPageToken = await drive.getStartPageToken() // antes de listar: nada se pierde entre medio
    const runId = await ingestion.startRun(auth, 'full')
    const results = reason ? [{ name: '(reconciliación)', outcome: 'info', reason }] : []
    try {
      const files = await drive.listFiles()
      const known = await knownDocuments(transaction, auth)
      for (const file of files) results.push(await ingestSafely(ingestion, auth, file, known, 'Ingesta completa desde Google Drive'))

      const seen = new Set(files.map((file) => file.id))
      const active = [...known.values()].filter((document) => document.document_status !== 'archived')
      const missing = active.filter((document) => !seen.has(document.external_id))
      if (missing.length > 1 && missing.length > active.length * MAX_ARCHIVE_FRACTION && !allowMassArchive) {
        results.push({ name: '(archivado)', outcome: 'failed', error: `Se archivarían ${missing.length} de ${active.length} documentos activos. Revisa GOOGLE_DRIVE_FOLDER_ID; para confirmarlo, ejecuta con --allow-mass-archive.` })
      } else {
        for (const document of missing) {
          const result = await archiveSafely(ingestion, auth, document, ARCHIVE_REASONS.missing)
          if (result) results.push(result)
        }
      }
      return { kind: 'full', ...(await finish(auth, runId, results, startPageToken)) }
    } catch (error) {
      results.push({ name: '(ejecución)', outcome: 'failed', error: error.message })
      await ingestion.finishRun(auth, runId, { failed: true, results }).catch(() => {})
      throw error
    }
  }

  return {
    /** Recorre toda la carpeta: ingesta cada archivo y archiva los documentos que ya no están. */
    full,

    /** Solo lo que cambió desde el último startPageToken. Sin token guardado, hace la ingesta completa. */
    async incremental(auth) {
      const state = await ingestion.loadStartPageToken(auth)
      if (!state || state.folder_id !== folderId) return full(auth)

      const changes = new Map()
      let pageToken = state.start_page_token
      let newStartPageToken = null
      while (pageToken) {
        const page = await drive.listChanges(pageToken)
        for (const change of page.changes ?? []) changes.set(change.fileId, change) // el último cambio de cada archivo manda
        pageToken = page.nextPageToken
        newStartPageToken = page.newStartPageToken ?? newStartPageToken // viene en la última página
      }
      const known = await knownDocuments(transaction, auth)
      if (needsFullReconciliation(changes.values(), known)) {
        return full(auth, { reason: 'Cambió una carpeta o desapareció un elemento desconocido: se reconcilió toda la carpeta.' })
      }

      const runId = await ingestion.startRun(auth, 'incremental', state.start_page_token)
      const results = []
      try {
        const folders = changes.size ? await drive.listFolderIds() : new Map()
        for (const change of changes.values()) {
          const decision = classifyChange(change, folders, known)
          if (decision.action === 'ingest') results.push(await ingestSafely(ingestion, auth, { ...change.file, folderPath: decision.folderPath }, known, 'Sincronización diaria (changes.list)'))
          if (decision.action === 'archive') {
            const result = await archiveSafely(ingestion, auth, known.get(change.fileId), decision.reason)
            if (result) results.push(result)
          }
        }
        return { kind: 'incremental', changesSeen: changes.size, ...(await finish(auth, runId, results, newStartPageToken)) }
      } catch (error) {
        results.push({ name: '(ejecución)', outcome: 'failed', error: error.message })
        await ingestion.finishRun(auth, runId, { failed: true, results }).catch(() => {})
        throw error
      }
    },
  }
}
