import { Router } from 'express'
import { checkPermission, getRequestsManagePermission } from '../controllers/permissionsController.js'
import { requireAuth } from '../middlewares/requireAuth.js'

const permissionsRouter = Router()

permissionsRouter.get('/auth/permissions/requests-manage', requireAuth, getRequestsManagePermission)
permissionsRouter.get('/auth/permissions/:permission', requireAuth, checkPermission)

export default permissionsRouter
