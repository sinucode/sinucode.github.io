import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { userService } from '../services/user.service';
import { UserRole } from '@prisma/client';

/**
 * Controlador de gestión de usuarios
 */
export class UserController {
    /**
     * Obtener todos los usuarios
     */
    async getUsers(req: Request, res: Response): Promise<void> {
        try {
            const requestingUserRole = req.user!.role as UserRole;
            const users = await userService.getAllUsers(requestingUserRole);

            res.json({
                success: true,
                data: users,
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch users',
            });
        }
    }

    /**
     * Obtener usuario por ID
     */
    async getUser(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const requestingUserRole = req.user!.role as UserRole;

            const user = await userService.getUserById(id, requestingUserRole);

            res.json({
                success: true,
                data: user,
            });
        } catch (error) {
            const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            res.status(status).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to fetch user',
            });
        }
    }

    /**
     * Crear nuevo usuario
     */
    async createUser(req: Request, res: Response): Promise<void> {
        try {
            // Validar datos
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    errors: errors.array(),
                });
                return;
            }

            const requestingUserRole = req.user!.role as UserRole;
            const requestingUserId = req.user!.userId;

            const user = await userService.createUser(
                req.body,
                requestingUserRole,
                requestingUserId
            );

            res.status(201).json({
                success: true,
                data: user,
                message: 'User created successfully',
            });
        } catch (error) {
            const status = error instanceof Error && error.message.includes('already exists') ? 409 : 500;
            res.status(status).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create user',
            });
        }
    }

    /**
     * Actualizar usuario
     */
    async updateUser(req: Request, res: Response): Promise<void> {
        try {
            // Validar datos
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    errors: errors.array(),
                });
                return;
            }

            const { id } = req.params;
            const requestingUserRole = req.user!.role as UserRole;
            const requestingUserId = req.user!.userId;

            const user = await userService.updateUser(
                id,
                req.body,
                requestingUserRole,
                requestingUserId
            );

            res.json({
                success: true,
                data: user,
                message: 'User updated successfully',
            });
        } catch (error) {
            console.error('Update user error in controller:', error);
            console.error('Request body:', req.body);
            console.error('User ID:', req.params.id);
            const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            res.status(status).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to update user',
            });
        }
    }

    /**
     * Activar/desactivar usuario
     */
    async toggleStatus(req: Request, res: Response): Promise<void> {
        try {
            // Validar datos
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    errors: errors.array(),
                });
                return;
            }

            const { id } = req.params;
            const requestingUserRole = req.user!.role as UserRole;
            const requestingUserId = req.user!.userId;

            const user = await userService.toggleUserStatus(
                id,
                requestingUserRole,
                requestingUserId
            );

            res.json({
                success: true,
                data: user,
                message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            });
        } catch (error) {
            const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            res.status(status).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to toggle user status',
            });
        }
    }

    /**
     * Activar/desactivar múltiples usuarios
     */
    async bulkToggleStatus(req: Request, res: Response): Promise<void> {
        try {
            // Validar datos
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    errors: errors.array(),
                });
                return;
            }

            const { userIds, activate } = req.body;
            const requestingUserRole = req.user!.role as UserRole;
            const requestingUserId = req.user!.userId;

            const result = await userService.bulkToggleUserStatus(
                userIds,
                activate,
                requestingUserRole,
                requestingUserId
            );

            res.json({
                success: true,
                data: result,
                message: `${result.count} user(s) ${result.status} successfully`,
            });
        } catch (error) {
            const status = error instanceof Error && error.message.includes('not found') ? 404 : 500;
            res.status(status).json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to bulk toggle user status',
            });
        }
    }
}

export const userController = new UserController();
