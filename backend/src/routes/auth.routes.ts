import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { loginLimiter } from '../middleware/rateLimiter.middleware';
import {
    loginValidation,
    changePasswordValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
} from '../validators/auth.validators';

const router = Router();

/**
 * POST /api/auth/login
 * Login con rate limiting estricto
 */
router.post(
    '/login',
    loginLimiter,
    validate(loginValidation),
    authController.login
);

/**
 * POST /api/auth/refresh
 * Renovar access token
 */
router.post('/refresh', authController.refresh);

/**
 * POST /api/auth/logout
 * Cerrar sesión (requiere autenticación)
 */
router.post('/logout', authenticate, authController.logout);

/**
 * GET /api/auth/me
 * Obtener usuario actual (requiere autenticación)
 */
router.get('/me', authenticate, authController.me);

/**
 * POST /api/auth/change-password
 * Cambiar contraseña (requiere autenticación)
 */
router.post(
    '/change-password',
    authenticate,
    validate(changePasswordValidation),
    authController.changePassword
);

/**
 * POST /api/auth/forgot-password
 * Solicitar código OTP para recuperación de clave
 */
router.post(
    '/forgot-password',
    validate(forgotPasswordValidation),
    authController.forgotPassword
);

/**
 * POST /api/auth/reset-password
 * Restablecer contraseña con código OTP
 */
router.post(
    '/reset-password',
    validate(resetPasswordValidation),
    authController.resetPassword
);

export default router;
