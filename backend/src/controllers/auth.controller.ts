import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { verifyRefreshToken, generateAccessToken } from '../utils/jwt';
import logger from '../utils/logger';

/**
 * POST /api/auth/login
 * Login de usuario
 */
export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        const ipAddress = req.ip;
        const userAgent = req.headers['user-agent'];

        const result = await authService.login(email, password, ipAddress, userAgent);

        res.json({
            success: true,
            data: result,
        });
    } catch (error) {
        if (error instanceof Error) {
            res.status(401).json({
                success: false,
                error: error.message,
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'An error occurred during login',
            });
        }
    }
};

/**
 * POST /api/auth/refresh
 * Renovar access token usando refresh token
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            res.status(400).json({
                success: false,
                error: 'Refresh token is required',
            });
            return;
        }

        const decoded = verifyRefreshToken(refreshToken);
        const newAccessToken = generateAccessToken(decoded);

        res.json({
            success: true,
            data: {
                accessToken: newAccessToken,
            },
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            error: 'Invalid or expired refresh token',
        });
    }
};

/**
 * POST /api/auth/logout
 * Cerrar sesión (por ahora solo logging, en producción invalidar tokens)
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        if (req.user) {
            logger.info('User logged out', { userId: req.user.userId });
        }

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'An error occurred during logout',
        });
    }
};

/**
 * GET /api/auth/me
 * Obtener información del usuario actual
 */
export const me = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized',
            });
            return;
        }

        res.json({
            success: true,
            data: {
                userId: req.user.userId,
                email: req.user.email,
                role: req.user.role,
            },
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'An error occurred',
        });
    }
};

/**
 * POST /api/auth/change-password
 * Cambiar contraseña del usuario actual
 */
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                error: 'Unauthorized',
            });
            return;
        }

        const { currentPassword, newPassword } = req.body;

        await authService.changePassword(req.user.userId, currentPassword, newPassword);

        res.json({
            success: true,
            message: 'Password changed successfully',
        });
    } catch (error) {
        if (error instanceof Error) {
            res.status(400).json({
                success: false,
                error: error.message,
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'An error occurred',
            });
        }
    }
};
