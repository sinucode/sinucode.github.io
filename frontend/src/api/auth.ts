import api from '../lib/axios';
import {
    ApiResponse,
    LoginRequest,
    LoginResponse,
    User,
} from '../types';

/**
 * Login
 */
export const login = async (credentials: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post<ApiResponse<LoginResponse>>('/auth/login', credentials);
    return response.data.data!;
};

/**
 * Refresh token
 */
export const refreshToken = async (refreshToken: string): Promise<{ accessToken: string }> => {
    const response = await api.post<ApiResponse<{ accessToken: string }>>('/auth/refresh', {
        refreshToken,
    });
    return response.data.data!;
};

/**
 * Logout
 */
export const logout = async (): Promise<void> => {
    await api.post('/auth/logout');
};

/**
 * Obtener usuario actual
 */
export const getCurrentUser = async (): Promise<User> => {
    const response = await api.get<ApiResponse<User>>('/auth/me');
    return response.data.data!;
};

/**
 * Cambiar contraseña
 */
export const changePassword = async (
    currentPassword: string,
    newPassword: string
): Promise<void> => {
    await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
    });
};
