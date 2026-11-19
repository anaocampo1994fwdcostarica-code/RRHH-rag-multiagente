import { Router } from 'express'
import { getEmployee, listEmployees } from '../controllers/employeesController.js'
import { requireAuth } from '../middlewares/requireAuth.js'
import { createRequirePermission } from '../middlewares/requirePermission.js'
const router = Router(); const requireEmployeesRead = createRequirePermission('employees.read')
router.get('/employees', requireAuth, requireEmployeesRead, listEmployees)
router.get('/employees/:id', requireAuth, requireEmployeesRead, getEmployee)
export default router
