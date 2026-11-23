import { createHttpError } from '../errors/httpError.js'
import { leaveRequestsRepository } from '../repositories/leaveRequestsRepository.js'
import { parseCreateLeaveRequestBody, parseLeaveRequestListQuery, parseUuid } from '../validation/leaveRequests.js'

function toLeaveRequestResponse(row) {
  return {
    id: row.id,
    leaveTypeId: row.leave_type_id,
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

export function createLeaveRequestsController({ repository = leaveRequestsRepository } = {}) {
  return {
    async list(request, response, next) {
      try {
        const filters = parseLeaveRequestListQuery(request.query)
        const result = await repository.list(request.auth, filters)
        response.status(200).json({
          data: result.rows.map(toLeaveRequestResponse),
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
        const id = parseUuid(request.params.id, 'id')
        const row = await repository.findVisibleById(request.auth, id)
        if (!row) throw createHttpError(404, 'Not found')
        response.status(200).json({ data: toLeaveRequestResponse(row) })
      } catch (error) {
        next(error)
      }
    },

    async create(request, response, next) {
      try {
        const input = parseCreateLeaveRequestBody(request.body)
        const employeeId = await repository.resolveCurrentEmployeeId(request.auth)
        const leaveType = await repository.findActiveLeaveType(request.auth, input.leaveTypeId)
        if (!leaveType) throw createHttpError(404, 'Not found')
        if (leaveType.requires_attachment) {
          throw createHttpError(409, 'This leave type requires an attachment, which is not supported yet.')
        }

        const row = await repository.createDraft(request.auth, {
          employeeId,
          ...input,
        })
        response.status(201).json({ data: toLeaveRequestResponse(row) })
      } catch (error) {
        next(error)
      }
    },

    async submit(request, response, next) {
      try {
        const id = parseUuid(request.params.id, 'id')
        const employeeId = await repository.resolveCurrentEmployeeId(request.auth)
        const current = await repository.findSubmissionCandidate(request.auth, id)
        if (!current || current.employee_id !== employeeId) throw createHttpError(404, 'Not found')
        if (current.status !== 'draft') throw createHttpError(409, 'Request is not a draft')

        const row = await repository.submitDraft(request.auth, id, employeeId, new Date().toISOString())
        if (!row) throw createHttpError(409, 'Request could not be submitted')
        response.status(200).json({ data: toLeaveRequestResponse(row) })
      } catch (error) {
        next(error)
      }
    },
  }
}

const controller = createLeaveRequestsController()
export const listLeaveRequests = controller.list
export const getLeaveRequest = controller.detail
export const createLeaveRequest = controller.create
export const submitLeaveRequest = controller.submit
