import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import { listAccounts, getAccountBalances, createAccount, updateAccount, deleteAccount, setDefaultAccount, getTodayClose, listCloses, createClose, reopenClose, autoCloseRun, autoOpenRun, getCloseReport } from '../controllers/account.controller';

const router = Router();

const accountTypes = ['cash', 'bank', 'wallet'];

// Cron de cierre automático — SIN authenticate (se protege con secreto). Vercel Cron usa GET.
router.get('/closes/auto-run', autoCloseRun);
router.post('/closes/auto-run', autoCloseRun);

// Cron de apertura automática — SIN authenticate
router.get('/closes/auto-open', autoOpenRun);
router.post('/closes/auto-open', autoOpenRun);

router.use(authenticate);

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

router.patch('/:id/default', requireMinRole('admin'), [
    body('kind').isIn(['payment', 'disbursement']).withMessage('kind debe ser "payment" o "disbursement"'),
], setDefaultAccount);

// Cierre diario
router.get('/closes/today', requireMinRole('user'), [query('businessId').isUUID()], getTodayClose);
router.get('/closes', requireMinRole('admin'), [query('businessId').isUUID()], listCloses);
router.get('/closes/report', requireMinRole('admin'), [
    query('businessId').isUUID().withMessage('businessId inválido'),
    query('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date debe ser YYYY-MM-DD'),
], getCloseReport);
// Cerrar caja — solo admin y super_admin
router.post('/closes', requireMinRole('admin'), [body('businessId').isUUID().withMessage('businessId inválido')], createClose);
router.post('/closes/:id/reopen', requireMinRole('super_admin'), [
    param('id').isUUID().withMessage('ID de cierre inválido'),
    body('reason').optional().isString().isLength({ max: 500 }).withMessage('Motivo demasiado largo (máx. 500 caracteres)'),
], reopenClose);

export default router;
