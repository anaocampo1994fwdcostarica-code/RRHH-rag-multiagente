import { createHttpError } from '../errors/httpError.js'
import { withUserTransaction } from '../services/withUserTransaction.js'

// Catálogo de documentos de Drive y última sincronización. Las consultas viven en la base
// (list_drive_documents, get_last_document_sync_run en 20261122090000); ambas exigen documents.manage.
export function createDocumentsRepository({ transaction = withUserTransaction } = {}) {
  async function run(auth, sql) {
    try {
      return await transaction(auth, async (client) => (await client.query(sql)).rows)
    } catch (error) {
      if (error?.code === '42501') throw createHttpError(403, 'Forbidden')
      throw error
    }
  }

  return {
    list: (auth) => run(auth, `select document_id, document_code, title, mime_type, format, doc_version, version_label,
        document_status, web_view_link, source_modified_at, updated_at from public.list_drive_documents()`),
    lastSyncRun: async (auth) => (await run(auth, `select run_id, run_kind, status, started_at, finished_at, documents_examined,
        documents_created, documents_updated, documents_archived, documents_failed, error_message
      from public.get_last_document_sync_run()`))[0] ?? null,
  }
}

export const documentsRepository = createDocumentsRepository()
