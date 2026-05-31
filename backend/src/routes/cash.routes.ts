import { Router } from 'express';
import { authenticate, requireMinRole, requirePermission } from '../middleware/auth.middleware';
import { recordMovement, injectCapital, withdrawFunds, getCashFlow, reconcile, forecastCash, createInternalTransfer } from '../controllers/cash.controller';
import { capitalValidators, flowValidators, forecastValidators, recordMovementValidators, transferValidators } from '../validators/cash.validators';

const router = Router();

router.use(authenticate);

// Movimientos genéricos (principalmente para usos internos o admin)
router.post('/movements', requireMinRole('admin'), recordMovementValidators, recordMovement);

// Inyección / retiro — admin o usuario con permiso canOperateCash
router.post('/inject',   requirePermission('canOperateCash'), capitalValidators, injectCapital);
router.post('/withdraw', requirePermission('canOperateCash'), capitalValidators, withdrawFunds);
// Transferencia entre cuentas — admin o usuario con permiso canTransferFunds
router.post('/transfer', requirePermission('canTransferFunds'), transferValidators, createInternalTransfer);

// Flujo de caja y conciliación
router.get('/flow', requireMinRole('user'), flowValidators, getCashFlow);
router.get('/reconcile', requireMinRole('user'), reconcile);
router.get('/forecast', requireMinRole('user'), forecastValidators, forecastCash);

export default router;
