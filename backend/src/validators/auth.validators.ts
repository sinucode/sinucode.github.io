import { body } from 'express-validator';

/**
 * Validaciones para login
 * OWASP: Injection (A03:2021) - Validación de entrada
 */
export const loginValidation = [
    body('email')
        .isEmail()
        .withMessage('Must be a valid email')
        .normalizeEmail()
        .toLowerCase(),
    body('password')
        .isString()
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters'),
];

/**
 * Validaciones para crear usuario
 */
export const createUserValidation = [
    body('email')
        .isEmail()
        .withMessage('Must be a valid email')
        .normalizeEmail()
        .toLowerCase(),
    body('password')
        .isString()
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
    body('fullName')
        .isString()
        .notEmpty()
        .withMessage('Full name is required')
        .trim()
        .isLength({ min: 2, max: 255 })
        .withMessage('Full name must be between 2 and 255 characters'),
    body('role')
        .isIn(['super_admin', 'business_user'])
        .withMessage('Role must be either super_admin or business_user'),
];

/**
 * Validaciones para cambiar contraseña
 */
export const changePasswordValidation = [
    body('currentPassword')
        .isString()
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isString()
        .notEmpty()
        .withMessage('New password is required')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, and one number'),
];
