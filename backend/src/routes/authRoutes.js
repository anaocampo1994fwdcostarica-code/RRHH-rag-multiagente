import { Router } from 'express'
import { getCurrentAuth } from '../controllers/authController.js'
import { requireAuth } from '../middlewares/requireAuth.js'

const authRouter = Router()

authRouter.get('/auth/me', requireAuth, getCurrentAuth)

export default authRouter
