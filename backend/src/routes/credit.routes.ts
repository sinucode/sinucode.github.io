import { Router } from 'express';
import { authenticate, requireMinRole } from '../middleware/auth.middleware';
import { simulateCredit, createCredit, listCredits, getCreditById, updateCreditSchedule } from '../controllers/credit.controller';
import { simulateCreditValidators, createCreditValidators, listCreditValidators, updateScheduleValidators } from '../validators/credit.validators';

const router = Router();

router.use(authenticate);

// Simular crédito
router.post('/simulate', requireMinRole('user'), simulateCreditValidators, simulateCredit);

// Crear crédito
router.post('/', requireMinRole('user'), createCreditValidators, createCredit);

// Listar créditos
router.get('/', requireMinRole('user'), listCreditValidators, listCredits);

// Detalle crédito
router.get('/:id', requireMinRole('user'), getCreditById);

// Actualizar plan de pagos (solo super admin)
router.put('/:id/schedule', requireMinRole('super_admin'), updateScheduleValidators, updateCreditSchedule);

export default router;
