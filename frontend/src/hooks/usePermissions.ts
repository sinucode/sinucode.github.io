import { useAuthStore } from '../store/authStore';
import { UserPermissions } from '../types';

/**
 * Hook para verificar permisos del usuario actual.
 *
 * - admin y super_admin tienen TODOS los permisos.
 * - user solo tiene los permisos que el super_admin le haya otorgado
 *   (almacenados en el JWT como `permissions`).
 *
 * Los permisos disponibles:
 *   canOperateCash    — Inyectar / retirar capital (Caja → Operaciones)
 *   canCloseCash      — Cerrar la caja diaria
 *   canTransferFunds  — Transferir entre cuentas
 */
export function usePermissions() {
    const { user } = useAuthStore();

    const isAdmin = ['admin', 'super_admin'].includes(user?.role || '');
    const isSuper = user?.role === 'super_admin';

    // Los permisos vienen en el payload del JWT → authStore.user.permissions
    const p = (user as any)?.permissions as UserPermissions | undefined;

    return {
        isAdmin,
        isSuper,

        // Operaciones: inyectar/retirar capital
        canOperateCash:   isAdmin || !!p?.canOperateCash,

        // Cerrar caja diaria
        canCloseCash:     isAdmin || !!p?.canCloseCash,

        // Transferir entre cuentas
        canTransferFunds: isAdmin || !!p?.canTransferFunds,
    };
}
