import { createHttpError } from '../errors/httpError.js'
import { permissionsRepository } from '../repositories/permissionsRepository.js'

export function createRequirePermission(permission, { repository = permissionsRepository } = {}) {
  return async function requirePermission(request, _response, next) {
    try {
      if (!request.auth || !(await repository.hasPermission(request.auth, permission))) {
        throw createHttpError(403, 'Forbidden')
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const requireRequestsManage = createRequirePermission('requests.manage')
export const requireDocumentsManage = createRequirePermission('documents.manage')
export const requireReportsRead = createRequirePermission('reports.read')
