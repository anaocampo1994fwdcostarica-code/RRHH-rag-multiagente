import { permissionsRepository } from '../repositories/permissionsRepository.js'

export function createPermissionsController({ repository = permissionsRepository } = {}) {
  return {
    async check(request, response, next) {
      try {
        const permission = request.params.permission
        if (!['employees.read', 'requests.manage', 'documents.manage', 'reports.read'].includes(permission)) {
          response.status(404).json({ error: 'Not found' })
          return
        }
        const allowed = await repository.hasPermission(request.auth, permission)
        response.status(200).json({ data: { allowed } })
      } catch (error) { next(error) }
    },
    async requestsManage(request, response, next) {
      try {
        const allowed = await repository.hasPermission(request.auth, 'requests.manage')
        response.status(200).json({ data: { allowed } })
      } catch (error) {
        next(error)
      }
    },
  }
}

const controller = createPermissionsController()
export const getRequestsManagePermission = controller.requestsManage
export const checkPermission = controller.check
