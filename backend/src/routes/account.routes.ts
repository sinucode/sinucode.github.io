import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import { listAccounts, getAccountBalances, createAccount, updateAccount, deleteAccount } from '../controllers/account.controller';

const router = Router();
router.use(authenticate);

const accountTypes = ['cash', 'bank', 'wallet'];

router.get('/', requireMinRole('user'), [query('businessId').isUUID().withMessage('businessId inválido')], listAccounts);
router.get('/balances', requireMinRole('user'), [query('businessId').isUUID().withMessage('businessId inválido')], getAccountBalances);

router.post('/', requireMinRole('user'), [
    body('businessId').isUUID().withMessage('businessId inválido'),
    body('name').trim().isLength({ min: 1, max: 50 }).withMessage('Nombre inválido'),
    body('type').optional().isIn(accountTypes).withMessage('Tipo inválido'),
], createAccount);

router.put('/:id', requireMinRole('user'), [
    body('name').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Nombre inválido'),
    body('type').optional().isIn(accountTypes).withMessage('Tipo inválido'),
], updateAccount);

router.delete('/:id', requireMinRole('user'), [
    body('mode').optional().isIn(['transfer', 'withdraw']).withMessage('Modo inválido'),
    body('targetAccountId').optional().isUUID().withMessage('Cuenta destino inválida'),
], deleteAccount);

export default router;
