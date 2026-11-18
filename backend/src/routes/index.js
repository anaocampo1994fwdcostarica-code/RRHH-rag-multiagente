import { Router } from 'express'
import authRouter from './authRoutes.js'
import healthRouter from './healthRoutes.js'
import leaveTypesRouter from './leaveTypesRoutes.js'
import leaveRequestsRouter from './leaveRequestsRoutes.js'
import policiesRouter from './policiesRoutes.js'

const apiRouter = Router()

apiRouter.use(healthRouter)
apiRouter.use(authRouter)
apiRouter.use(policiesRouter)
apiRouter.use(leaveTypesRouter)
apiRouter.use(leaveRequestsRouter)

export default apiRouter
