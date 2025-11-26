import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import { config } from '../config/env';

/**
 * Middleware para manejo centralizado de errores
 * OWASP: Security Misconfiguration (A05:2021) - Ocultar detalles de implementación en producción
 */
export const errorHandler = (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
): void => {
    // Log del error completo
    logger.error('Error handler caught error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        user: req.user?.userId,
    });

    // Manejo de errores de Prisma
    if (err.name === 'PrismaClientKnownRequestError') {
        // P2002: Unique constraint failed
        if ((err as any).code === 'P2002') {
            res.status(409).json({
                error: 'Conflict',
                message: 'A record with this unique field already exists',
            });
            return;
        }
        // P2025: Record not found
        if ((err as any).code === 'P2025') {
            res.status(404).json({
                error: 'Not Found',
                message: 'Record not found',
            });
            return;
        }
    }

    // En producción, ocultar detalles del error
    const isDevelopment = config.nodeEnv === 'development';

    res.status(500).json({
        error: 'Internal server error',
        ...(isDevelopment && {
            message: err.message,
            stack: err.stack,
        }),
    });
};

/**
 * Middleware para rutas no encontradas (404)
 */
export const notFoundHandler = (req: Request, res: Response): void => {
    logger.warn('Route not found', {
        path: req.path,
        method: req.method,
    });

    res.status(404).json({
        error: 'Route not found',
        path: req.path,
    });
};
