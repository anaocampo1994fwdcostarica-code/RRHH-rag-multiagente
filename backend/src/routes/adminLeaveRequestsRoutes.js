import { Router } from 'express'
import { getAdminLeaveRequest, listAdminLeaveRequests } from '../controllers/adminLeaveRequestsController.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { requireRequestsManage } from '../middlewares/requirePermission.js'

const adminLeaveRequestsRouter = Router()

adminLeaveRequestsRouter.get('/admin/leave-requests', requireAuth, requireRequestsManage, listAdminLeaveRequests)
adminLeaveRequestsRouter.get('/admin/leave-requests/:id', requireAuth, requireRequestsManage, getAdminLeaveRequest)

export default adminLeaveRequestsRouter
