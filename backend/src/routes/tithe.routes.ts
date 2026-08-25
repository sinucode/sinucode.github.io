import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import { getTitheSummary, payTithe } from '../controllers/tithe.controller';

const router = Router();

router.use(authenticate);
// Todo el módulo de diezmo es exclusivo del super_admin
router.use(requireMinRole('super_admin'));

const summaryValidators = [
    query('businessId').isUUID().withMessage('businessId inválido'),
];

const payValidators = [
    body('businessId').isUUID().withMessage('businessId inválido'),
    body('creditIds').isArray({ min: 1 }).withMessage('Debe seleccionar al menos un crédito'),
    body('creditIds.*').isUUID().withMessage('creditId inválido'),
    body('accountId').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('La cuenta seleccionada es inválida'),
];

// GET /api/tithe/summary?businessId=X
router.get('/summary', summaryValidators, getTitheSummary);

// POST /api/tithe/pay  { businessId, creditIds: [] }
router.post('/pay', payValidators, payTithe);

export default router;
