import { Router } from 'express'
import healthRouter from './healthRoutes.js'

const apiRouter = Router()

apiRouter.use(healthRouter)

export default apiRouter
