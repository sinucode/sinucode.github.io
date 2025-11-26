import { body } from 'express-validator';

/**
 * Validadores para crear negocio
 * Siguiendo OWASP A03:2021 - Injection & Input Validation
 */
export const createBusinessValidators = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('El nombre del negocio es requerido')
        .isLength({ min: 3, max: 100 })
        .withMessage('El nombre debe tener entre 3 y 100 caracteres')
        .matches(/^[a-záéíóúñA-ZÁÉÍÓÚÑ0-9\s\-&.,]+$/)
        .withMessage('El nombre contiene caracteres no permitidos')
        .escape(), // XSS prevention

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres')
        .escape(), // XSS prevention

    body('initialCapital')
        .optional()
        .isFloat({ min: 0, max: 999999999999.99 })
        .withMessage('El capital inicial debe ser un número válido entre 0 y 999,999,999,999.99')
        .customSanitizer((value) => {
            // Ensure 2 decimal places max
            return value ? parseFloat(parseFloat(value).toFixed(2)) : 0;
        }),
];

/**
 * Validadores para actualizar negocio
 * Siguiendo OWASP A03:2021 - Injection & Input Validation
 */
export const updateBusinessValidators = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage('El nombre debe tener entre 3 y 100 caracteres')
        .matches(/^[a-záéíóúñA-ZÁÉÍÓÚÑ0-9\s\-&.,]+$/)
        .withMessage('El nombre contiene caracteres no permitidos')
        .escape(), // XSS prevention

    body('description')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('La descripción no puede exceder 500 caracteres')
        .escape(), // XSS prevention

    // initialCapital NO debe permitirse en actualización por seguridad financiera
    body('initialCapital')
        .not().exists()
        .withMessage('El capital inicial no puede ser modificado después de la creación'),
];
