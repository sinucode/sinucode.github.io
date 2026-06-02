import { Router } from 'express';
import { query, body, param } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import {
    getCreditsSummary,
    updateBusinessPrice,
    createBilling,
    listBillings,
} from '../controllers/billing.controller';

const router = Router();

// Todas las rutas de facturación son exclusivas de super_admin
router.use(authenticate, requireMinRole('super_admin'));

router.get(
    '/summary',
    [
        query('startDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('startDate debe ser YYYY-MM-DD'),
        query('endDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('endDate debe ser YYYY-MM-DD'),
    ],
    getCreditsSummary,
);

router.patch(
    '/price/:businessId',
    [
        param('businessId').isUUID().withMessage('businessId inválido'),
        body('pricePerUnit').isFloat({ min: 0 }).withMessage('pricePerUnit debe ser número >= 0'),
    ],
    updateBusinessPrice,
);

router.post(
    '/',
    [
        body('businessId').isUUID().withMessage('businessId inválido'),
        body('businessName').trim().isLength({ min: 1 }).withMessage('businessName requerido'),
        body('periodStart').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('periodStart debe ser YYYY-MM-DD'),
        body('periodEnd').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('periodEnd debe ser YYYY-MM-DD'),
        body('creditsCount').isInt({ min: 0 }).withMessage('creditsCount debe ser entero >= 0'),
        body('pricePerUnit').isFloat({ min: 0 }).withMessage('pricePerUnit debe ser número >= 0'),
        body('totalAmount').isFloat({ min: 0 }).withMessage('totalAmount debe ser número >= 0'),
        body('notes').optional().isString(),
    ],
    createBilling,
);

router.get('/', listBillings);

export default router;
