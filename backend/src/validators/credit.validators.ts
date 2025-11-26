import { body, query } from 'express-validator';

const frequencyValues = ['daily', 'weekly', 'biweekly', 'monthly'];

export const simulateCreditValidators = [
    body('amount')
        .isFloat({ gt: 0 })
        .withMessage('El monto debe ser mayor a 0'),
    body('interestRate')
        .isFloat({ gt: 0 })
        .withMessage('La tasa de interés debe ser mayor a 0'),
    body('termDays')
        .isInt({ gt: 0 })
        .withMessage('El plazo debe ser mayor a 0'),
    body('frequency')
        .isIn(frequencyValues)
        .withMessage('Frecuencia inválida'),
    body('startDate')
        .optional()
        .isISO8601()
        .withMessage('La fecha de inicio es inválida'),
];

export const createCreditValidators = [
    body('clientId')
        .isUUID()
        .withMessage('El cliente es requerido'),
    body('businessId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('El negocio es inválido'),
    ...simulateCreditValidators,
];

export const listCreditValidators = [
    query('businessId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('businessId inválido'),
    query('status')
        .optional()
        .isIn(['active', 'paid', 'overdue', 'cancelled'])
        .withMessage('status inválido'),
    query('dueToday')
        .optional()
        .isBoolean()
        .withMessage('dueToday debe ser booleano'),
    query('overdue')
        .optional()
        .isBoolean()
        .withMessage('overdue debe ser booleano'),
];

export const updateScheduleValidators = [
    body('schedules')
        .isArray({ min: 1 })
        .withMessage('Debes enviar las cuotas a actualizar'),
    body('schedules.*.id')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('La cuota es inválida'),
    body('schedules.*.installmentNumber')
        .optional({ nullable: true, checkFalsy: true })
        .isInt({ gt: 0 })
        .withMessage('El número de cuota es inválido'),
    body('schedules.*.dueDate')
        .isISO8601()
        .withMessage('La fecha de vencimiento es inválida'),
    body('schedules.*.scheduledAmount')
        .isFloat({ gt: 0 })
        .withMessage('El monto de la cuota debe ser mayor a 0'),
];
