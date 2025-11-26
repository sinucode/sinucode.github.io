import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';

/**
 * Jerarquía de roles del sistema
 * super_admin > admin > user
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
    super_admin: 3,
    admin: 2,
    user: 1,
};

/**
 * Verifica si un rol puede gestionar otro rol
 * Un rol puede gestionar roles de nivel igual o inferior
 */
export const canManageRole = (managerRole: UserRole, targetRole: UserRole): boolean => {
    return ROLE_HIERARCHY[managerRole] >= ROLE_HIERARCHY[targetRole];
};

/**
 * Verifica si un rol puede crear otro rol
 * Un rol solo puede crear roles de nivel igual o inferior
 */
export const canCreateRole = (creatorRole: UserRole, newRole: UserRole): boolean => {
    return ROLE_HIERARCHY[creatorRole] >= ROLE_HIERARCHY[newRole];
};

/**
 * Obtiene los roles que un usuario puede gestionar
 */
export const getManagedRoles = (userRole: UserRole): UserRole[] => {
    const userLevel = ROLE_HIERARCHY[userRole];
    return (Object.keys(ROLE_HIERARCHY) as UserRole[]).filter(
        (role) => ROLE_HIERARCHY[role] <= userLevel
    );
};

/**
 * Middleware para verificar que el usuario tiene al menos el rol mínimo requerido
 */
export const requireMinRole = (minRole: UserRole) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        const userRole = req.user?.role as UserRole;

        if (!userRole || ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[minRole]) {
            res.status(403).json({
                error: 'Forbidden',
                message: `This action requires at least ${minRole} role`,
            });
            return;
        }

        next();
    };
};
