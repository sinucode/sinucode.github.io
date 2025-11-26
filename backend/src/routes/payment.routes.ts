import { Router } from 'express';
import { authenticate, requireMinRole } from '../middleware/auth.middleware';
import { registerPayment, listPayments } from '../controllers/payment.controller';
import { listPaymentsValidators, registerPaymentValidators } from '../validators/payment.validators';

const router = Router();

router.use(authenticate);

router.post('/', requireMinRole('user'), registerPaymentValidators, registerPayment);
router.get('/', requireMinRole('user'), listPaymentsValidators, listPayments);

export default router;
