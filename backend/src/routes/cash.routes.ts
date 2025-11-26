import { Router } from 'express';
import { authenticate, requireMinRole } from '../middleware/auth.middleware';
import { recordMovement, injectCapital, withdrawFunds, getCashFlow, reconcile, forecastCash } from '../controllers/cash.controller';
import { capitalValidators, flowValidators, forecastValidators, recordMovementValidators } from '../validators/cash.validators';

const router = Router();

router.use(authenticate);

// Movimientos genéricos (principalmente para usos internos o admin)
router.post('/movements', requireMinRole('admin'), recordMovementValidators, recordMovement);

// Inyección / retiro (solo admin)
router.post('/inject', requireMinRole('admin'), capitalValidators, injectCapital);
router.post('/withdraw', requireMinRole('admin'), capitalValidators, withdrawFunds);

// Flujo de caja y conciliación
router.get('/flow', requireMinRole('user'), flowValidators, getCashFlow);
router.get('/reconcile', requireMinRole('user'), reconcile);
router.get('/forecast', requireMinRole('user'), forecastValidators, forecastCash);

export default router;
