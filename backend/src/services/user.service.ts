import prisma from '../config/database';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { canManageRole, canCreateRole, getManagedRoles } from '../middleware/roleHierarchy.middleware';

interface CreateUserData {
    email: string;
    fullName: string;
    password: string;
    role: UserRole;
    businessId?: string;
}

interface UpdateUserData {
    email?: string;
    fullName?: string;
    role?: UserRole;
    isActive?: boolean;
    businessId?: string;
}

/**
 * Servicio de gestión de usuarios
 */
export class UserService {
    /**
     * Obtener todos los usuarios (filtrados según jerarquía)
     */
    async getAllUsers(requestingUserRole: UserRole) {
        const managedRoles = getManagedRoles(requestingUserRole);

        const users = await prisma.user.findMany({
            where: {
                role: {
                    in: managedRoles,
                },
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Map id to userId for frontend compatibility
        return users.map(user => ({
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        }));
    }

    /**
     * Obtener usuario por ID
     */
    async getUserById(userId: string, requestingUserRole: UserRole) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        if (!user) {
            throw new Error('User not found');
        }

        // Verificar que el solicitante pueda ver este usuario
        if (!canManageRole(requestingUserRole, user.role)) {
            throw new Error('Insufficient permissions to view this user');
        }

        return user;
    }

    /**
     * Crear nuevo usuario
     */
    async createUser(data: CreateUserData, requestingUserRole: UserRole, requestingUserId: string) {
        // Verificar que el solicitante puede crear este rol
        if (!canCreateRole(requestingUserRole, data.role)) {
            throw new Error(`Cannot create user with role ${data.role}`);
        }

        // Verificar que el email no exista
        const existingUser = await prisma.user.findUnique({
            where: { email: data.email },
        });

        if (existingUser) {
            throw new Error('Email already exists');
        }

        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(data.password, 10);

        // Crear usuario
        const user = await prisma.user.create({
            data: {
                email: data.email,
                fullName: data.fullName,
                passwordHash: hashedPassword,
                role: data.role,
                isActive: true,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Asignar negocio si es rol user
        if (data.role === 'user' && data.businessId) {
            await prisma.userBusiness.create({
                data: {
                    userId: user.id,
                    businessId: data.businessId,
                },
            });
        }

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                action: 'CREATE_USER',
                description: `Created user '${user.fullName}' (${user.email}) with role '${user.role}'`,
                entityType: 'User',
                entityId: user.id,
                newValues: { email: user.email, role: user.role },
                ipAddress: '',
            },
        });

        // Map id to userId for frontend compatibility
        return {
            userId: user.id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }

    /**
     * Actualizar usuario
     */
    async updateUser(
        userId: string,
        data: UpdateUserData,
        requestingUserRole: UserRole,
        requestingUserId: string
    ) {
        // Obtener usuario a actualizar
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!targetUser) {
            throw new Error('User not found');
        }

        // Verificar que el solicitante puede gestionar este usuario
        if (!canManageRole(requestingUserRole, targetUser.role)) {
            throw new Error('Insufficient permissions to update this user');
        }

        // Si se está cambiando el rol, verificar que puede crear ese rol
        if (data.role && !canCreateRole(requestingUserRole, data.role)) {
            throw new Error(`Cannot assign role ${data.role}`);
        }

        // Si se está cambiando el email, verificar que no exista
        if (data.email && data.email !== targetUser.email) {
            const existingUser = await prisma.user.findUnique({
                where: { email: data.email },
            });
            if (existingUser) {
                throw new Error('Email already exists');
            }
        }

        // Actualizar usuario
        let updateData: any = {
            ...(data.email && { email: data.email }),
            ...(data.fullName && { fullName: data.fullName }),
            ...(data.role && { role: data.role }),
            ...(data.isActive !== undefined && { isActive: data.isActive }),
        };

        // Handle password if provided
        if ((data as any).password) {
            const hashed = await bcrypt.hash((data as any).password, 10);
            updateData.passwordHash = hashed;
        }

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Reasignar negocio si rol user y viene businessId
        if (updatedUser.role === 'user' && data.businessId) {
            await prisma.userBusiness.deleteMany({
                where: { userId },
            });
            await prisma.userBusiness.create({
                data: {
                    userId,
                    businessId: data.businessId,
                },
            });
        }

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                action: 'UPDATE_USER',
                description: `Updated user '${updatedUser.fullName}' (${updatedUser.email})`,
                entityType: 'User',
                entityId: userId,
                newValues: data as any,
                ipAddress: '',
            },
        });

        // Map id to userId for frontend compatibility
        return {
            userId: updatedUser.id,
            email: updatedUser.email,
            fullName: updatedUser.fullName,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        };
    }

    /**
     * Activar/desactivar usuario
     */
    async toggleUserStatus(
        userId: string,
        requestingUserRole: UserRole,
        requestingUserId: string
    ) {
        // No permitir que un usuario se desactive a sí mismo
        if (userId === requestingUserId) {
            throw new Error('Cannot toggle your own status');
        }

        // Obtener usuario
        const targetUser = await prisma.user.findUnique({
            where: { id: userId },
        });

        if (!targetUser) {
            throw new Error('User not found');
        }

        // Verificar permisos
        if (!canManageRole(requestingUserRole, targetUser.role)) {
            throw new Error('Insufficient permissions to toggle this user status');
        }

        // Toggle status
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                isActive: !targetUser.isActive,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
            },
        });

        // Auditar
        await prisma.auditLog.create({
            data: {
                userId: requestingUserId,
                action: 'TOGGLE_USER_STATUS',
                description: `${updatedUser.isActive ? 'Activated' : 'Deactivated'} user '${updatedUser.fullName}' (${updatedUser.email})`,
                entityType: 'User',
                entityId: userId,
                newValues: { isActive: updatedUser.isActive },
                ipAddress: '',
            },
        });

        // Map id to userId for frontend compatibility
        return {
            userId: updatedUser.id,
            email: updatedUser.email,
            fullName: updatedUser.fullName,
            role: updatedUser.role,
            isActive: updatedUser.isActive,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
        };
    }

    /**
     * Activar/desactivar múltiples usuarios a la vez
     */
    async bulkToggleUserStatus(
        userIds: string[],
        activate: boolean,
        requestingUserRole: UserRole,
        requestingUserId: string
    ) {
        // Filtrar el userId del solicitante para evitar auto-desactivarse
        const targetUserIds = userIds.filter(id => id !== requestingUserId);

        if (targetUserIds.length === 0) {
            throw new Error('No valid users to update');
        }

        // Obtener todos los usuarios a actualizar
        const targetUsers = await prisma.user.findMany({
            where: { id: { in: targetUserIds } },
        });

        if (targetUsers.length === 0) {
            throw new Error('No users found');
        }

        // Verificar permisos para cada usuario
        for (const user of targetUsers) {
            if (!canManageRole(requestingUserRole, user.role)) {
                throw new Error(`Insufficient permissions to manage user with role ${user.role}`);
            }
        }

        // Ejecutar en transacción
        const result = await prisma.$transaction(async (tx) => {
            // Actualizar usuarios
            const updatedUsers = await tx.user.updateMany({
                where: { id: { in: targetUserIds } },
                data: { isActive: activate },
            });

            // Crear registros de auditoría para cada usuario
            const auditPromises = targetUserIds.map(userId =>
                tx.auditLog.create({
                    data: {
                        userId: requestingUserId,
                        action: 'BULK_TOGGLE_USER_STATUS',
                        entityType: 'User',
                        entityId: userId,
                        newValues: { isActive: activate },
                        ipAddress: '',
                    },
                })
            );

            await Promise.all(auditPromises);

            return updatedUsers;
        });

        return {
            count: result.count,
            status: activate ? 'activated' : 'deactivated',
        };
    }
}

export const userService = new UserService();
