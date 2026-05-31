import api from '../lib/axios';

export interface UserPermissions {
    canOperateCash?: boolean;
    canCloseCash?: boolean;
    canTransferFunds?: boolean;
}

export interface User {
    userId: string;
    email: string;
    fullName: string;
    role: 'super_admin' | 'admin' | 'user';
    isActive: boolean;
    permissions?: UserPermissions;
    createdAt: string;
    updatedAt: string;
    businessId?: string | null;
    businessName?: string | null;
}

export interface CreateUserData {
    email: string;
    fullName: string;
    password: string;
    role: 'super_admin' | 'admin' | 'user';
    businessId?: string;
}

export interface UpdateUserData {
    email?: string;
    fullName?: string;
    password?: string;
    role?: 'super_admin' | 'admin' | 'user';
    isActive?: boolean;
    businessId?: string;
}

/**
 * Obtener todos los usuarios
 */
export const getAllUsers = async (): Promise<User[]> => {
    const response = await api.get('/users');
    return response.data.data;
};

/**
 * Crear nuevo usuario
 */
export const createUser = async (data: CreateUserData): Promise<User> => {
    const response = await api.post('/users', data);
    return response.data.data;
};

/**
 * Actualizar usuario
 */
export const updateUser = async (id: string, data: UpdateUserData): Promise<User> => {
    const response = await api.put(`/users/${id}`, data);
    return response.data.data;
};

/**
 * Activar/desactivar usuario
 */
export const toggleUserStatus = async (id: string): Promise<User> => {
    const response = await api.patch(`/users/${id}/toggle-status`);
    return response.data.data;
};

/**
 * Actualizar permisos granulares de un usuario (solo super_admin)
 */
export const updateUserPermissions = async (
    userId: string,
    permissions: UserPermissions
): Promise<{ userId: string; fullName: string; permissions: UserPermissions }> => {
    const response = await api.patch(`/users/${userId}/permissions`, { permissions });
    return response.data.data;
};

/**
 * Activar/desactivar múltiples usuarios
 */
export const bulkToggleUserStatus = async (
    userIds: string[],
    activate: boolean
): Promise<{ count: number; status: string }> => {
    const response = await api.post('/users/bulk-toggle-status', {
        userIds,
        activate,
    });
    return response.data.data;
};
