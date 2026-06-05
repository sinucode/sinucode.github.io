import { body, query } from 'express-validator';

// loan_disbursement e interest_earned se excluyen intencionalmente: solo pueden crearse desde
// credit.service dentro de una transacción.
//  • loan_disbursement: permitirlo en el endpoint genérico habilita doble-débito.
//  • interest_earned: tiene doble semántica (donación con relatedPaymentId = caja real; ganancia
//    de cierre sin relatedPaymentId = solo reporte, NO caja). La reconstrucción de saldos trata
//    el segundo caso como efecto cero; un interest_earned manual sin relatedPaymentId sumaría a
//    business.currentBalance pero se ignoraría por cuenta, rompiendo la invariante de saldos.
const movementTypes = [
    'initial_capital',
    'capital_injection',
    'withdrawal',
    'payment_received',
    'internal_transfer',
];

export const recordMovementValidators = [
    body('businessId').isUUID().withMessage('businessId inválido'),
    body('type').isIn(movementTypes).withMessage('Tipo de movimiento inválido'),
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
    body('description').optional().isLength({ min: 3, max: 200 }).withMessage('Descripción inválida'),
    body('relatedCreditId').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('relatedCreditId inválido'),
    body('relatedPaymentId').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('relatedPaymentId inválido'),
];

export const capitalValidators = [
    body('businessId').isUUID().withMessage('businessId inválido'),
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
    body('description').optional().isLength({ min: 3, max: 200 }).withMessage('Descripción inválida'),
    body('accountId').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('Cuenta inválida'),
];

export const flowValidators = [
    query('businessId').isUUID().withMessage('businessId inválido'),
    query('startDate').optional().isISO8601().withMessage('startDate inválida'),
    query('endDate').optional().isISO8601().withMessage('endDate inválida'),
];

export const forecastValidators = [
    query('businessId').isUUID().withMessage('businessId inválido'),
    query('targetDate').isISO8601().withMessage('targetDate inválida'),
];
export const transferValidators = [
    body('businessId').isUUID().withMessage('businessId inválido'),
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
    body('fromAccountId').isUUID().withMessage('Debe especificar la cuenta de origen'),
    body('toAccountId').isUUID().withMessage('Debe especificar la cuenta de destino'),
    body('description').optional().isLength({ min: 3, max: 200 }).withMessage('Descripción inválida'),
];
