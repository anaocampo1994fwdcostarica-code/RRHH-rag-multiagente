import { createHttpError } from '../errors/httpError.js'
import { employeesRepository } from '../repositories/employeesRepository.js'
import { parsePagination } from '../validation/listQuery.js'
import { parseUuid } from '../validation/leaveRequests.js'

const toEmployee = (row) => ({ id: row.id, employeeCode: row.employee_code, displayName: row.profile?.display_name ?? null, department: row.department?.name ?? null, position: row.position?.name ?? null, employmentStatus: row.employment_status, hiredOn: row.hired_on, endedOn: row.ended_on })
export function createEmployeesController({ repository = employeesRepository } = {}) {
  return {
    async list(request, response, next) { try { const filters = parsePagination(request.query); const result = await repository.list(request.auth, filters); response.status(200).json({ data: result.rows.map(toEmployee), page: filters.page, limit: filters.limit, total: result.total }) } catch (error) { next(error) } },
    async detail(request, response, next) { try { const row = await repository.findById(request.auth, parseUuid(request.params.id, 'id')); if (!row) throw createHttpError(404, 'Not found'); response.status(200).json({ data: toEmployee(row) }) } catch (error) { next(error) } },
  }
}
const controller = createEmployeesController(); export const listEmployees = controller.list; export const getEmployee = controller.detail
