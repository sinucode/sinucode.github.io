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
        // Buscar usuario por email
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
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
