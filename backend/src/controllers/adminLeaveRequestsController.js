import { createHttpError } from '../errors/httpError.js'
import { adminLeaveRequestsRepository } from '../repositories/adminLeaveRequestsRepository.js'
import { parseLeaveRequestListQuery, parseUuid } from '../validation/leaveRequests.js'

function toAdminResponse(row) {
  return {
    id: row.id,
    employee: row.employee ? { employeeCode: row.employee.employee_code, displayName: row.employee.profile?.display_name ?? null } : null,
    leaveTypeId: row.leave_type_id,
    leaveTypeName: row.leave_type?.name ?? null,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    submittedAt: row.submitted_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function createAdminLeaveRequestsController({ repository = adminLeaveRequestsRepository } = {}) {
  return {
    async list(request, response, next) {
      try {
        const filters = parseLeaveRequestListQuery(request.query)
        const result = await repository.list(request.auth, filters)
        response.status(200).json({ data: result.rows.map(toAdminResponse), page: filters.page, limit: filters.limit, total: result.total })
      } catch (error) {
        next(error)
      }
    },
    async detail(request, response, next) {
      try {
        const row = await repository.findById(request.auth, parseUuid(request.params.id, 'id'))
        if (!row) throw createHttpError(404, 'Not found')
        response.status(200).json({ data: toAdminResponse(row) })
      } catch (error) {
        next(error)
      }
    },
  }
}

const controller = createAdminLeaveRequestsController()
export const listAdminLeaveRequests = controller.list
export const getAdminLeaveRequest = controller.detail
