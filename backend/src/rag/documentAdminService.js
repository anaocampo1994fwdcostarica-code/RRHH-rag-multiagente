// Servicio de POST /admin/documents/sync: misma sincronización incremental que npm run sync:drive,
// firmada por el usuario de RRHH que la solicita (sus permisos y RLS aplican).
import { getEmbeddingProvider } from '../llm/providers.js'
import { withUserTransaction } from '../services/withUserTransaction.js'
import { createDriveIngestion } from './driveIngestion.js'
import { createDriveSync } from './driveSync.js'
import { createGoogleDriveClient } from './googleDriveClient.js'

export function createDocumentAdminService({ folderId = process.env.GOOGLE_DRIVE_FOLDER_ID } = {}) {
  let sync
  let running = null
  function getSync() {
    if (sync) return sync
    const drive = createGoogleDriveClient()
    const transaction = (auth, callback) => withUserTransaction(auth, callback)
    const ingestion = createDriveIngestion({ drive, embeddings: getEmbeddingProvider(), transaction })
    sync = createDriveSync({ drive, ingestion, transaction, folderId })
    return sync
  }
  return {
    // Una sola sincronización a la vez por proceso: dos clics seguidos no duplican trabajo.
    async sync(auth) {
      running ??= getSync().incremental(auth).finally(() => { running = null })
      const report = await running
      const count = (outcome) => report.results.filter((result) => result.outcome === outcome).length
      return {
        kind: report.kind, runId: report.runId, failed: report.failed,
        examined: report.results.length, created: count('created'), updated: count('updated'),
        renamed: count('renamed'), archived: count('archived'), failedDocuments: count('failed'),
      }
    },
  }
}
