import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { getCurrentUser } from '../api/auth';

/**
 * Hook para inicializar la autenticación al cargar la app
 * Verifica si hay un token en localStorage y valida la sesión
 */
export const useAuthInit = () => {
    const { setUser, setLoading, logout } = useAuthStore();

    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('accessToken');

            if (!token) {
                // No hay token, marcar como no autenticado
                setLoading(false);
                return;
            }

            try {
                // Verificar si el token es válido obteniendo el usuario actual
                const user = await getCurrentUser();
                setUser(user);
                setLoading(false);
            } catch (error) {
                // Token inválido o expirado, limpiar la sesión
                logout();
            }
        };

        initAuth();
    }, [setUser, setLoading, logout]);
};
