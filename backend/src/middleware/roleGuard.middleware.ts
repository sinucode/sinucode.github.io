import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Middleware para verificar roles de usuario
 * OWASP: Broken Access Control (A01:2021)
 */
export const requireRole = (...allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            logger.warn('Access denied - insufficient permissions', {
                userId: req.user.userId,
                role: req.user.role,
                requiredRoles: allowedRoles,
                path: req.path,
            });
            res.status(403).json({ error: 'Forbidden - insufficient permissions' });
            return;
        }

        next();
    };
};

/**
 * Middleware para verificar que el usuario solo acceda a su negocio asignado
 * OWASP: Broken Access Control (A01:2021)
 */
export const requireBusinessAccess = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        // Super admin tiene acceso a todo
        if (req.user.role === 'super_admin') {
            next();
            return;
        }

        // Para business_user, verificar acceso al negocio
        const businessId = req.params.businessId || req.body.businessId || req.query.businessId;

        if (!businessId) {
            res.status(400).json({ error: 'Business ID is required' });
            return;
        }

        // Aquí verificaremos contra la BD en el servicio correspondiente
        // Por ahora, permitimos que continúe y se valide en el controlador
        next();
    } catch (error) {
        logger.error('Business access check failed', { error, userId: req.user?.userId });
        res.status(500).json({ error: 'Internal server error' });
    }
};
