import { Router } from 'express'
import { getPolicy, listPolicies } from '../controllers/policiesController.js'
import { requireAuth } from '../middlewares/requireAuth.js'

const policiesRouter = Router()

policiesRouter.get('/policies', requireAuth, listPolicies)
policiesRouter.get('/policies/:slug', requireAuth, getPolicy)

export default policiesRouter
