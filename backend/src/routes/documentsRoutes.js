import { Router } from 'express'
import { getLastSyncRun, listDocuments, syncDocuments } from '../controllers/documentsController.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { requireDocumentsManage } from '../middlewares/requirePermission.js'

const router = Router()
router.get('/admin/documents', requireAuth, requireDocumentsManage, listDocuments)
router.get('/admin/documents/sync/last', requireAuth, requireDocumentsManage, getLastSyncRun)
router.post('/admin/documents/sync', requireAuth, requireDocumentsManage, syncDocuments)
export default router
