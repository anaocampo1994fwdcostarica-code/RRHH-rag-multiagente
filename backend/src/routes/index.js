import { Router } from 'express'
import adminLeaveRequestsRouter from './adminLeaveRequestsRoutes.js'
import authRouter from './authRoutes.js'
import chatRouter from './chatRoutes.js'
import employeesRouter from './employeesRoutes.js'
import documentsRouter from './documentsRoutes.js'
import healthRouter from './healthRoutes.js'
import leaveTypesRouter from './leaveTypesRoutes.js'
import leaveRequestsRouter from './leaveRequestsRoutes.js'
import reportsRouter from './reportsRoutes.js'
import policiesRouter from './policiesRoutes.js'
import permissionsRouter from './permissionsRoutes.js'
import securityLabRouter from './securityLabRoutes.js'

const apiRouter = Router()

apiRouter.use(healthRouter)
apiRouter.use(authRouter)
apiRouter.use(chatRouter)
apiRouter.use(employeesRouter)
apiRouter.use(documentsRouter)
apiRouter.use(permissionsRouter)
apiRouter.use(securityLabRouter)
apiRouter.use(policiesRouter)
apiRouter.use(leaveTypesRouter)
apiRouter.use(leaveRequestsRouter)
apiRouter.use(adminLeaveRequestsRouter)
apiRouter.use(reportsRouter)

export default apiRouter
