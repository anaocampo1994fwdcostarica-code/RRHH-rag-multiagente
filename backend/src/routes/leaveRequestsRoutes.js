import { Router } from 'express'
import { createLeaveRequest, getLeaveRequest, listLeaveRequests } from '../controllers/leaveRequestsController.js'
import { requireAuth } from '../middlewares/requireAuth.js'

const leaveRequestsRouter = Router()

leaveRequestsRouter.get('/leave-requests', requireAuth, listLeaveRequests)
leaveRequestsRouter.get('/leave-requests/:id', requireAuth, getLeaveRequest)
leaveRequestsRouter.post('/leave-requests', requireAuth, createLeaveRequest)

export default leaveRequestsRouter
