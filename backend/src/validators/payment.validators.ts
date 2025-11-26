import { body, query } from 'express-validator';

export const registerPaymentValidators = [
    body('creditId')
        .isUUID()
        .withMessage('El crédito es requerido'),
    body('amount')
        .isFloat({ gt: 0 })
        .withMessage('El monto debe ser mayor a 0'),
    body('paymentDate')
        .optional()
        .isISO8601()
        .withMessage('La fecha de pago es inválida'),
    body('paymentMethod')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 50 })
        .withMessage('El método de pago es muy largo'),
    body('scheduleId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('La cuota seleccionada es inválida'),
    body('notes')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 300 })
        .withMessage('Las notas no pueden superar 300 caracteres'),
];

export const listPaymentsValidators = [
    query('businessId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('businessId inválido'),
    query('startDate')
        .optional({ nullable: true, checkFalsy: true })
        .isISO8601()
        .withMessage('startDate inválida'),
    query('endDate')
        .optional({ nullable: true, checkFalsy: true })
        .isISO8601()
        .withMessage('endDate inválida'),
    query('paymentMethod')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 50 })
        .withMessage('paymentMethod inválido'),
];
