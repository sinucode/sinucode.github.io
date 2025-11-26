import { body, query } from 'express-validator';

const movementTypes = [
    'initial_capital',
    'capital_injection',
    'withdrawal',
    'loan_disbursement',
    'payment_received',
    'interest_earned',
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
