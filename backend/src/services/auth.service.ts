import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { generateAccessToken, generateRefreshToken, TokenPayload } from '../utils/jwt';
import logger from '../utils/logger';
import { auditLog } from './audit.service';

const SALT_ROUNDS = 12; // OWASP: Cryptographic Failures (A02:2021) - Usar salt rounds adecuado

export interface LoginResult {
    accessToken: string;
    refreshToken: string;
    user: {
        id: string;
        email: string;
        fullName: string;
        role: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        assignedBusiness?: {
            id: string;
            name: string;
        };
    };
}

/**
 * Login de usuario
 * OWASP: Authentication Failures (A07:2021)
 */
export const login = async (
    email: string,
    password: string,
    ipAddress?: string,
    userAgent?: string
): Promise<LoginResult> => {
    try {
        // Buscar usuario por email con su negocio asignado (si lo tiene)
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
            include: {
                userBusinesses: {
                    include: { business: true },
                    take: 1
                }
            }
        });

        if (!user) {
            logger.warn('Login attempt - user not found', { email, ipAddress });
            throw new Error('Invalid credentials');
        }

        if (!user.isActive) {
            logger.warn('Login attempt - user inactive', { email, ipAddress });
            throw new Error('Account is inactive');
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            logger.warn('Login attempt - account locked due to brute force', { email, ipAddress });
            throw new Error('Account temporarily locked due to multiple failed login attempts. Please try again later.');
        }

        // Reset lockout if time has passed
        let currentFailedAttempts = user.failedLoginAttempts || 0;
        if (user.lockedUntil && user.lockedUntil <= new Date()) {
            currentFailedAttempts = 0;
            await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, lockedUntil: null },
            });
        }

        // Verificar contraseña
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
            const newFailedAttempts = currentFailedAttempts + 1;
            const updates: any = { failedLoginAttempts: newFailedAttempts };

            if (newFailedAttempts >= 5) {
                const lockoutTime = new Date();
                lockoutTime.setMinutes(lockoutTime.getMinutes() + 15);
                updates.lockedUntil = lockoutTime;

                await auditLog({
                    userId: user.id,
                    action: 'ACCOUNT_LOCKED',
                    entityType: 'user',
                    entityId: user.id,
                    ipAddress,
                    userAgent,
                    description: 'Account locked due to 5 failed login attempts',
                });
            }

            // Actualizar contador en BD
            await prisma.user.update({
                where: { id: user.id },
                data: updates,
            });

            logger.warn('Login attempt - invalid password', { email, userId: user.id, ipAddress });

            // Registrar intento de login fallido en auditoría
            await auditLog({
                userId: user.id,
                action: 'LOGIN_FAILED',
                entityType: 'user',
                entityId: user.id,
                ipAddress,
                userAgent,
            });

            throw new Error('Invalid credentials');
        }

        // Si el login es exitoso, resetear contadores
        if (user.failedLoginAttempts > 0 || user.lockedUntil) {
            await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: 0, lockedUntil: null },
            });
        }

        // Generar tokens JWT
        const tokenPayload: TokenPayload = {
            userId: user.id,
            email: user.email,
            role: user.role,
        };

        const accessToken = generateAccessToken(tokenPayload);
        const refreshToken = generateRefreshToken(tokenPayload);

        // Registrar login exitoso en auditoría
        await auditLog({
            userId: user.id,
            action: 'LOGIN_SUCCESS',
            entityType: 'user',
            entityId: user.id,
            ipAddress,
            userAgent,
        });

        logger.info('User logged in successfully', { userId: user.id, email: user.email });

        return {
            accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isActive: user.isActive,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                assignedBusiness: user.userBusinesses && user.userBusinesses.length > 0 ? {
                    id: user.userBusinesses[0].business.id,
                    name: user.userBusinesses[0].business.name
                } : undefined,
            },
        };
    } catch (error) {
        if (error instanceof Error && error.message === 'Invalid credentials') {
            throw error;
        }
        if (error instanceof Error && error.message === 'Account is inactive') {
            throw error;
        }
        if (error instanceof Error && error.message.includes('locked')) {
            throw error;
        }
        logger.error('Login error', { error, email });
        throw new Error('An error occurred during login');
    }
};

/**
 * Cambiar contraseña
 */
export const changePassword = async (
    userId: string,
    currentPassword: string,
    newPassword: string
): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Verificar contraseña actual
        const isPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);

        if (!isPasswordValid) {
            throw new Error('Current password is incorrect');
        }

        // Hash de la nueva contraseña
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Actualizar contraseña
        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash: newPasswordHash },
        });

        // Registrar en auditoría
        await auditLog({
            userId,
            action: 'CHANGE_PASSWORD',
            entityType: 'user',
            entityId: userId,
        });

        logger.info('Password changed successfully', { userId });
    } catch (error) {
        logger.error('Change password error', { error, userId });
        throw error;
    }
};


