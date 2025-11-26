import rateLimit from 'express-rate-limit';
import logger from '../utils/logger';

/**
 * Rate limiter general para todas las rutas de API
 * OWASP: Security Misconfiguration (A05:2021)
 */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Límite de 100 requests por windowMs
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: (req, res) => {
        logger.warn('Rate limit exceeded', {
            ip: req.ip,
            path: req.path,
        });
        res.status(429).json({
            error: 'Too many requests, please try again later',
        });
    },
});

/**
 * Rate limiter estricto para login
 * OWASP: Authentication Failures (A07:2021) - Protección contra fuerza bruta
 */
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos  
    max: 5, // Solo 5 intentos de login por IP cada 15 minutos
    skipSuccessfulRequests: true, // No contar requests exitosos
    message: 'Too many login attempts, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logger.warn('Login rate limit exceeded', {
            ip: req.ip,
            email: req.body.email,
        });
        res.status(429).json({
            error: 'Too many login attempts, please try again after 15 minutes',
        });
    },
});

/**
 * Rate limiter para operaciones sensibles (crear/editar/eliminar)
 */
export const strictLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutos
    max: 20, // 20 requests cada 5 minutos
    message: 'Too many requests, please slow down',
    standardHeaders: true,
    legacyHeaders: false,
});
