import { body, param } from 'express-validator';

/**
 * Validaciones para creación de usuario
 */
export const createUserValidators = [
    body('email')
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
    body('fullName')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage(
            'Password must contain uppercase, lowercase, number and special character'
        ),
    body('role')
        .isIn(['super_admin', 'admin', 'user'])
        .withMessage('Invalid role'),
];

/**
 * Validaciones para actualización de usuario
 */
export const updateUserValidators = [
    param('id').isUUID().withMessage('Invalid user ID'),
    body('email')
        .optional()
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),
    body('fullName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Full name must be between 2 and 100 characters'),
    body('role')
        .optional()
        .isIn(['super_admin', 'admin', 'user'])
        .withMessage('Invalid role'),
    body('password')
        .optional()
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain uppercase, lowercase, number and special character'),
    body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

/**
 * Validación para toggle de estado
 */
export const toggleStatusValidators = [
    param('id').isUUID().withMessage('Invalid user ID'),
];

/**
 * Validación para toggle de estado masivo
 */
export const bulkToggleStatusValidators = [
    body('userIds')
        .isArray({ min: 1 })
        .withMessage('userIds must be a non-empty array'),
    body('userIds.*')
        .isUUID()
        .withMessage('Each user ID must be a valid UUID'),
    body('activate')
        .isBoolean()
        .withMessage('activate must be a boolean'),
];
