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
