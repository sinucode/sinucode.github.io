import { useEffect } from 'react';
import { AxiosError } from 'axios';
import { useAuthStore } from '../store/authStore';
import { useBusinessStore } from '../store/businessStore';
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

                if ((user?.role === 'user' || user?.role === 'admin') && user.assignedBusiness) {
                    useBusinessStore.getState().setSelectedBusiness(user.assignedBusiness.id, user.assignedBusiness.name);
                }

                setLoading(false);
            } catch (error) {
                // Distinguir "el servidor rechazó al usuario" (401 token inválido, 403
                // cuenta inactiva/permisos revocados) de un fallo transitorio (500, timeout,
                // red caída por backend reiniciándose / cold start). Solo en el primer caso
                // cerramos sesión; ante un error transitorio conservamos la sesión persistida
                // para no expulsar al usuario por un hipo del servidor.
                const status = (error as AxiosError)?.response?.status;
                if (status === 401 || status === 403) {
                    logout();
                } else {
                    setLoading(false);
                }
            }
        };

        initAuth();
    }, [setUser, setLoading, logout]);
};
