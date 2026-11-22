import { createHttpError } from '../errors/httpError.js'
import { policiesRepository } from '../repositories/policiesRepository.js'
import { parsePolicyListQuery, parsePolicySlug } from '../validation/policies.js'

function toPolicyResponse(row) {
  return {
    slug: row.slug,
    code: row.document_code,
    title: row.title,
    category: row.category,
    version: row.doc_version,
    revision: row.revision,
    effectiveFrom: row.effective_from,
    driveUrl: row.drive_url,
    publishedAt: row.published_at,
  }
}

export function createPoliciesController({ repository = policiesRepository } = {}) {
  return {
    async list(request, response, next) {
      try {
        const filters = parsePolicyListQuery(request.query)
        const result = await repository.list(request.auth, filters)
        response.status(200).json({
          data: result.rows.map(toPolicyResponse),
          page: filters.page,
          limit: filters.limit,
          total: result.total,
        })
      } catch (error) {
        next(error)
      }
    },

    async detail(request, response, next) {
      try {
        const slug = parsePolicySlug(request.params.slug)
        const row = await repository.findBySlug(request.auth, slug)
        if (!row) throw createHttpError(404, 'Not found')
        response.status(200).json({ data: toPolicyResponse(row) })
      } catch (error) {
        next(error)
      }
    },
  }
}

const controller = createPoliciesController()
export const listPolicies = controller.list
export const getPolicy = controller.detail
