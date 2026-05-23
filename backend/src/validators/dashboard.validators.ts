import { query } from 'express-validator';

export const dashboardStatsValidators = [
    query('businessId')
        .isUUID()
        .withMessage('businessId es requerido y debe ser un UUID válido'),
    query('startDate')
        .isISO8601()
        .withMessage('startDate debe ser una fecha ISO8601 válida'),
    query('endDate')
        .isISO8601()
        .withMessage('endDate debe ser una fecha ISO8601 válida'),
];
