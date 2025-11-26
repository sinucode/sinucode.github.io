import { Router } from 'express';
import { auditController } from '../controllers/audit.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';

const router = Router();

// Todas las rutas requieren autenticación y rol admin
router.use(authenticate);
router.use(requireMinRole('admin'));

/**
 * GET /api/audit
 * Obtener logs de auditoría con filtros
 * Query params: businessId, userId, action, startDate, endDate, page, limit
 */
router.get('/', auditController.getAuditLogs.bind(auditController));

/**
 * GET /api/audit/export
 * Exportar logs de auditoría a Excel
 * Query params: businessId, userId, action, startDate, endDate
 */
router.get('/export', auditController.exportLogs.bind(auditController));

/**
 * GET /api/audit/actions
 * Obtener acciones disponibles para filtros
 */
router.get('/actions', auditController.getActions.bind(auditController));

/**
 * DELETE /api/audit/:id
 * Eliminar log de auditoría (solo super_admin)
 */
router.delete('/:id', auditController.deleteLog.bind(auditController));

export default router;
