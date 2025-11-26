import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { loginLimiter } from '../middleware/rateLimiter.middleware';
import {
    loginValidation,
    changePasswordValidation,
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

export default router;
