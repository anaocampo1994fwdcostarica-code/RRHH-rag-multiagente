import { createHttpError } from '../errors/httpError.js'
import { documentsRepository } from '../repositories/documentsRepository.js'
import { createDocumentAdminService } from '../rag/documentAdminService.js'

function toDocument(row) {
  return {
    id: row.document_id,
    code: row.document_code,
    title: row.title,
    format: row.format,
    version: row.doc_version ?? row.version_label ?? null,
    status: row.document_status,
    driveUrl: row.web_view_link,
    sourceModifiedAt: row.source_modified_at,
    updatedAt: row.updated_at,
  }
}

function toSyncRun(row) {
  if (!row) return null
  return {
    id: row.run_id, kind: row.run_kind, status: row.status, startedAt: row.started_at, finishedAt: row.finished_at,
    examined: row.documents_examined, created: row.documents_created, updated: row.documents_updated,
    archived: row.documents_archived, failed: row.documents_failed, errorMessage: row.error_message,
  }
}

export function createDocumentsController({ repository = documentsRepository, adminService = createDocumentAdminService(), isSyncEnabled = () => process.env.ENABLE_DOCUMENT_SYNC === 'true' } = {}) {
  return {
    async list(request, response, next) {
      try {
        const rows = await repository.list(request.auth)
        response.status(200).json({ data: rows.map(toDocument), total: rows.length })
      } catch (error) { next(error) }
    },
    async lastSync(request, response, next) {
      try {
        response.status(200).json({ data: toSyncRun(await repository.lastSyncRun(request.auth)), syncEnabled: isSyncEnabled() })
      } catch (error) { next(error) }
    },
    async sync(request, response, next) {
      try {
        if (request.body && Object.keys(request.body).length) throw createHttpError(400, 'Invalid synchronization request')
        if (!isSyncEnabled()) throw createHttpError(503, 'Document synchronization is disabled')
        const result = await adminService.sync(request.auth)
        response.status(202).json({ data: result })
      } catch (error) {
        // 55P03: start_document_sync_run detectó otra sincronización en curso (p. ej. la tarea de las 02:00).
        next(error?.code === '55P03' ? createHttpError(409, 'A synchronization is already running') : error)
      }
    },
  }
}

const controller = createDocumentsController()
export const listDocuments = controller.list
export const getLastSyncRun = controller.lastSync
export const syncDocuments = controller.sync
