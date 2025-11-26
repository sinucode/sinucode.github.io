import { body } from 'express-validator';

/**
 * Validadores para crear cliente
 * Siguiendo OWASP A03:2021 - Injection & Input Validation
 */
export const createClientValidators = [
    body('fullName')
        .trim()
        .notEmpty()
        .withMessage('El nombre completo es requerido')
        .isLength({ min: 3, max: 100 })
        .withMessage('El nombre debe tener entre 3 y 100 caracteres')
        .matches(/^[a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/)
        .withMessage('El nombre solo puede contener letras y espacios')
        .escape(), // XSS prevention

    body('phone')
        .trim()
        .notEmpty()
        .withMessage('El celular es requerido')
        .matches(/^3\d{9}$/)
        .withMessage('El celular debe tener 10 dígitos y comenzar con 3'),

    body('cedula')
        .trim()
        .notEmpty()
        .withMessage('El documento es requerido')
        .matches(/^\d{6,15}$/)
        .withMessage('El documento debe contener entre 6 y 15 dígitos'),

    body('nationality')
        .trim()
        .notEmpty()
        .withMessage('La nacionalidad es requerida')
        .isLength({ min: 3, max: 50 })
        .withMessage('La nacionalidad debe tener entre 3 y 50 caracteres')
        .matches(/^[a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/)
        .withMessage('La nacionalidad solo puede contener letras y espacios')
        .escape(), // XSS prevention

    body('address')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('La dirección no puede exceder 200 caracteres')
        .escape(), // XSS prevention

    body('referredById')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('El ID del cliente que recomienda debe ser válido'),

    // businessId solo requerido para admin/super_admin
    body('businessId')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('El ID del negocio debe ser válido'),
];

/**
 * Validadores para actualizar cliente
 * Siguiendo OWASP A03:2021 - Injection & Input Validation
 */
export const updateClientValidators = [
    body('fullName')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('El nombre debe tener entre 3 y 100 caracteres')
        .matches(/^[a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/)
        .withMessage('El nombre solo puede contener letras y espacios')
        .escape(),

    body('phone')
        .optional()
        .trim()
        .matches(/^3\d{9}$/)
        .withMessage('El celular debe tener 10 dígitos y comenzar con 3'),

    body('cedula')
        .optional()
        .trim()
        .matches(/^\d{6,15}$/)
        .withMessage('El documento debe contener entre 6 y 15 dígitos'),

    body('nationality')
        .optional()
        .trim()
        .isLength({ min: 3, max: 50 })
        .withMessage('La nacionalidad debe tener entre 3 y 50 caracteres')
        .matches(/^[a-záéíóúñA-ZÁÉÍÓÚÑ\s]+$/)
        .withMessage('La nacionalidad solo puede contener letras y espacios')
        .escape(),

    body('address')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('La dirección no puede exceder 200 caracteres')
        .escape(),

    body('referredById')
        .optional({ nullable: true, checkFalsy: true })
        .isUUID()
        .withMessage('El ID del cliente que recomienda debe ser válido'),

    // businessId NO puede ser modificado
    body('businessId')
        .not().exists()
        .withMessage('El negocio no puede ser modificado después de la creación'),
];
