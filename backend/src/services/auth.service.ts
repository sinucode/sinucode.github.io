import bcrypt from 'bcrypt';
import prisma from '../config/database';
import { UserRole } from '@prisma/client';
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

        // Verificar contraseña
        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

        if (!isPasswordValid) {
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
        logger.error('Login error', { error, email });
        throw new Error('An error occurred during login');
    }
};

/**
 * Crear nuevo usuario
 * OWASP: Cryptographic Failures (A02:2021) - Hash seguro de contraseñas
 */
export const createUser = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    createdByUserId?: string
): Promise<{ id: string; email: string }> => {
    try {
        // Verificar que el email no esté en uso
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            throw new Error('Email already in use');
        }

        // Hash de la contraseña
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Crear usuario
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                fullName,
                role,
            },
        });

        // Registrar en auditoría
        if (createdByUserId) {
            await auditLog({
                userId: createdByUserId,
                action: 'CREATE_USER',
                entityType: 'user',
                entityId: user.id,
                newValues: {
                    email: user.email,
                    fullName: user.fullName,
                    role: user.role,
                },
            });
        }

        logger.info('User created successfully', { userId: user.id, email: user.email, role: user.role });

        return {
            id: user.id,
            email: user.email,
        };
    } catch (error) {
        if (error instanceof Error && error.message === 'Email already in use') {
            throw error;
        }
        logger.error('Create user error', { error, email });
        throw new Error('An error occurred while creating user');
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

/**
 * Solicitar recuperación de contraseña (Generar Código OTP)
 */
export const forgotPassword = async (email: string): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        // Por seguridad, no lanzar error si el usuario no existe para evitar enumeración.
        if (!user || !user.isActive) {
            logger.info('Forgot password requested for non-existent or inactive email', { email });
            return;
        }

        // Generar código numérico de 6 dígitos aleatorio
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

        // Expira en 10 minutos
        const resetPasswordExpires = new Date();
        resetPasswordExpires.setMinutes(resetPasswordExpires.getMinutes() + 10);

        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: resetCode,
                resetPasswordExpires,
            },
        });

        // Enviar el correo electrónico
        const { sendPasswordResetEmail } = await import('../utils/email');
        await sendPasswordResetEmail(user.email, resetCode);

        // Registrar en auditoría
        await auditLog({
            userId: user.id,
            action: 'FORGOT_PASSWORD_REQUESTED',
            entityType: 'user',
            entityId: user.id,
        });

        logger.info('Password reset code generated and sent', { userId: user.id });
    } catch (error) {
        logger.error('Forgot password error', { error, email });
        throw new Error('An error occurred while processing password reset request');
    }
};

/**
 * Validar código OTP y cambiar la contraseña
 */
export const resetPassword = async (
    email: string,
    code: string,
    newPassword: string
): Promise<void> => {
    try {
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user || !user.isActive) {
            throw new Error('Invalid or expired password reset link/code');
        }

        // Validar que exista el token y coincida
        if (
            !user.resetPasswordToken ||
            user.resetPasswordToken !== code ||
            !user.resetPasswordExpires
        ) {
            throw new Error('Invalid reset code');
        }

        // Validar expiración
        if (new Date() > user.resetPasswordExpires) {
            throw new Error('Reset code has expired');
        }

        // Hashear nueva contraseña
        const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Actualizar usuario y limpiar el token
        await prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash: newPasswordHash,
                resetPasswordToken: null,
                resetPasswordExpires: null,
            },
        });

        // Registrar en auditoría
        await auditLog({
            userId: user.id,
            action: 'PASSWORD_RESET_COMPLETED',
            entityType: 'user',
            entityId: user.id,
        });

        logger.info('Password reset completed successfully', { userId: user.id });
    } catch (error) {
        if (error instanceof Error &&
            (error.message === 'Invalid reset code' ||
                error.message === 'Reset code has expired' ||
                error.message === 'Invalid or expired password reset link/code')) {
            throw error;
        }
        logger.error('Reset password error', { error, email });
        throw new Error('An error occurred while resetting password');
    }
};
