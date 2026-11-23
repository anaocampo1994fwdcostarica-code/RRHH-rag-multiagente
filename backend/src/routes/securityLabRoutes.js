import { Router } from 'express'
import { safeSearch, vulnerableSearch } from '../controllers/securityLabController.js'

const router = Router()
router.get('/lab/vulnerable/search', vulnerableSearch)
router.get('/lab/safe/search', safeSearch)
export default router
