import { leaveTypesRepository } from '../repositories/leaveTypesRepository.js'
import { parsePagination } from '../validation/listQuery.js'

function toLeaveTypeResponse(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    requiresAttachment: row.requires_attachment,
  }
}

export function createLeaveTypesController({ repository = leaveTypesRepository } = {}) {
  return async function list(request, response, next) {
    try {
      const pagination = parsePagination(request.query)
      const result = await repository.listActive(request.auth, pagination)
      response.status(200).json({
        data: result.rows.map(toLeaveTypeResponse),
        page: pagination.page,
        limit: pagination.limit,
        total: result.total,
      })
    } catch (error) {
      next(error)
    }
  }
}

export const listLeaveTypes = createLeaveTypesController()
