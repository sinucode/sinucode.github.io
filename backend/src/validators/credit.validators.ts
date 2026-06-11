import { body, query } from 'express-validator';

const frequencyValues = ['daily', 'weekly', 'bisemanal', 'quincenal', 'monthly'];

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
    body('excludedWeekdays')
        .optional({ nullable: true })
        .isArray()
        .withMessage('excludedWeekdays debe ser un arreglo')
        .custom((val) => {
            if (Array.isArray(val) && val.length >= 7) {
                throw new Error('No puedes excluir todos los días de la semana');
            }
            return true;
        }),
    body('excludedWeekdays.*')
        .optional()
        .isInt({ min: 0, max: 6 })
        .withMessage('Cada día debe ser un número entre 0 y 6'),
    body('excludeHolidays')
        .optional({ nullable: true })
        .isBoolean({ strict: true })
        .withMessage('excludeHolidays debe ser booleano'),
    body('customRounding')
        .optional({ nullable: true })
        .isBoolean({ strict: true })
        .withMessage('customRounding debe ser booleano'),
];

export const createCreditValidators = [
    body('clientId')
        .isUUID()
        .withMessage('El cliente es requerido'),
    body('businessId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('El negocio es inválido'),
    body('accountId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('La cuenta de desembolso es inválida'),
    body('splits')
        .optional({ nullable: true })
        .isArray({ min: 2 })
        .withMessage('splits debe tener al menos 2 cuentas'),
    // Cuando splits viene, cada elemento DEBE tener accountId y amount válidos
    body('splits.*.accountId')
        .isUUID()
        .withMessage('splits: accountId inválido (UUID requerido)'),
    body('splits.*.amount')
        .isFloat({ gt: 0 })
        .withMessage('splits: monto debe ser mayor a 0'),
    // Financiamientos cruzados (opcional)
    body('financings')
        .optional({ nullable: true })
        .isArray()
        .withMessage('financings debe ser un arreglo'),
    body('financings.*.creditId')
        .isUUID()
        .withMessage('financings: creditId inválido (UUID requerido)'),
    body('financings.*.scheduleId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('financings: scheduleId inválido (UUID requerido)'),
    body('financings.*.amount')
        .isFloat({ gt: 0 })
        .withMessage('financings: monto debe ser mayor a 0'),
    body('financings.*.excessAction')
        .optional({ nullable: true, checkFalsy: true })
        .isIn(['next_cuota', 'donate'])
        .withMessage('financings: excessAction debe ser "next_cuota" o "donate"')
        .custom((value, { req, path }) => {
            if (value) {
                // Extraer el índice de la ruta "financings[N].excessAction"
                const match = path.match(/financings\[(\d+)\]/);
                const idx = match ? Number(match[1]) : -1;
                const financing = req.body?.financings?.[idx];
                if (!financing?.scheduleId) {
                    throw new Error('financings: excessAction requiere scheduleId para indicar la cuota');
                }
            }
            return true;
        }),
    ...simulateCreditValidators,
];

export const listCreditValidators = [
    query('businessId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('businessId inválido'),
    query('clientId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('clientId inválido'),
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
    body('amount')
        .optional()
        .isFloat({ gt: 0 })
        .withMessage('El monto debe ser mayor a 0'),
    body('interestRate')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('La tasa de interés debe ser válida'),
    body('termDays')
        .optional()
        .isInt({ gt: 0 })
        .withMessage('El plazo debe ser mayor a 0'),
    body('frequency')
        .optional()
        .isIn(frequencyValues)
        .withMessage('Frecuencia inválida'),
    body('startDate')
        .optional()
        .isISO8601()
        .withMessage('La fecha de inicio es inválida'),
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
