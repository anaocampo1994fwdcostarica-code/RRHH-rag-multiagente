import { createHttpError } from '../errors/httpError.js'
import { documentsRepository } from '../repositories/documentsRepository.js'
import { createDocumentAdminService } from '../rag/documentAdminService.js'

function parsePage(query) {
  const page = Number.parseInt(query.page ?? '1', 10)
  const limit = Number.parseInt(query.limit ?? '20', 10)
  if (!Number.isInteger(page) || !Number.isInteger(limit) || page < 1 || limit < 1 || limit > 50) throw createHttpError(400, 'Invalid pagination')
  return { page, limit, offset: (page - 1) * limit }
}

function toDocument(row) {
  const versions = row.document_versions ?? []
  const latest = versions.sort((left, right) => String(right.processed_at ?? '').localeCompare(String(left.processed_at ?? '')))[0] ?? null
  const linkedPolicy = latest?.policy_versions?.find((version) => version.is_current)?.hr_policies ?? null
  return { id: row.id, title: row.title, mimeType: row.mime_type, status: row.document_status, updatedAt: row.updated_at, version: latest?.version_label ?? null, processingStatus: latest?.processing_status ?? null, processingError: latest?.processing_error ?? null, processedAt: latest?.processed_at ?? null, policy: linkedPolicy ? { id: linkedPolicy.id, title: linkedPolicy.title, status: linkedPolicy.status, archivedAt: linkedPolicy.archived_at } : null }
}

export function createDocumentsController({ repository = documentsRepository, adminService = createDocumentAdminService(), isSyncEnabled = () => process.env.ENABLE_DOCUMENT_SYNC === 'true' } = {}) {
  return {
    async list(request, response, next) {
      try {
        const pagination = parsePage(request.query)
        const result = await repository.list(request.auth, pagination)
        response.status(200).json({ data: result.rows.map(toDocument), page: pagination.page, limit: pagination.limit, total: result.total })
      } catch (error) { next(error) }
    },
    async sync(request, response, next) {
      try {
        if (request.body && Object.keys(request.body).length) throw createHttpError(400, 'Invalid synchronization request')
        if (!isSyncEnabled()) throw createHttpError(503, 'Document synchronization is disabled')
        const result = await adminService.sync(request.auth)
        response.status(202).json({ data: result })
      } catch (error) { next(error) }
    },
  }
}

const controller = createDocumentsController()
export const listDocuments = controller.list
export const syncDocuments = controller.sync
