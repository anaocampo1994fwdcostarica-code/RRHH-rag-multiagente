import { Router } from 'express'
import { listLeaveTypes } from '../controllers/leaveTypesController.js'
import { requireAuth } from '../middlewares/requireAuth.js'

const leaveTypesRouter = Router()

leaveTypesRouter.get('/leave-types', requireAuth, listLeaveTypes)

export default leaveTypesRouter
