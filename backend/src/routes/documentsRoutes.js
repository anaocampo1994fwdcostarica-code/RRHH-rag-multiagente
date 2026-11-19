import { Router } from 'express'
import { listDocuments, syncDocuments } from '../controllers/documentsController.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { requireDocumentsManage } from '../middlewares/requirePermission.js'

const router = Router()
router.get('/admin/documents', requireAuth, requireDocumentsManage, listDocuments)
router.post('/admin/documents/sync', requireAuth, requireDocumentsManage, syncDocuments)
export default router
