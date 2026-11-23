import { Router } from 'express'
import { getDailyReport, getDailyReportHistory } from '../controllers/reportsController.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { requireReportsRead } from '../middlewares/requirePermission.js'

const router = Router()
router.get('/reports/daily', requireAuth, requireReportsRead, getDailyReport)
router.get('/reports/daily/history', requireAuth, requireReportsRead, getDailyReportHistory)
export default router
