import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import logger from '../utils/logger';

// Extender la interfaz Request de Express para incluir user
declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}

/**
 * Middleware de autenticación - Verifica que el usuario tenga un token JWT válido
 * OWASP: Authentication Failures (A07:2021)
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'No token provided' });
            return;
        }

        const token = authHeader.substring(7); // Remover 'Bearer '

        const decoded = verifyAccessToken(token);
        req.user = decoded;

        next();
    } catch (error) {
        logger.warn('Authentication failed', { error, path: req.path });
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

/**
 * Middleware para verificar permiso granular.
 * admin y super_admin siempre pasan. user pasa solo si tiene el permiso en su JWT.
 */
export const requirePermission = (permission: string) => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        // admin y super_admin tienen todos los permisos
        if (['admin', 'super_admin'].includes(req.user.role)) return next();
        // Verificar permiso granular en el payload del JWT
        const perms = (req.user.permissions as Record<string, boolean> | undefined) || {};
        if (perms[permission]) return next();
        return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    };
};

/**
 * Middleware para verificar rol mínimo
 */
export const requireMinRole = (minRole: 'user' | 'admin' | 'super_admin') => {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const roles = ['user', 'admin', 'super_admin'];
        const userRoleIndex = roles.indexOf(req.user.role);
        const minRoleIndex = roles.indexOf(minRole);

        if (userRoleIndex === -1 || minRoleIndex === -1) {
            return res.status(500).json({ error: 'Invalid role configuration' });
        }

        if (userRoleIndex < minRoleIndex) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
        return;
    };
};
