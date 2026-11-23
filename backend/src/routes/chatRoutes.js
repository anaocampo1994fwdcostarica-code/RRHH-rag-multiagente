import { Router } from 'express'
import { askChat } from '../controllers/chatController.js'
import { requireAuth } from '../middlewares/requireAuth.js'
const router = Router(); router.post('/chat', requireAuth, askChat); export default router
