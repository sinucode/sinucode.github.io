import { Router } from 'express';
import { userController } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import {
    createUserValidators,
    updateUserValidators,
    toggleStatusValidators,
    bulkToggleStatusValidators,
} from '../validators/user.validators';

const router = Router();

// Todas las rutas requieren autenticación y al menos rol admin
router.use(authenticate);
router.use(requireMinRole('admin'));

/**
 * GET /api/users
 * Obtener todos los usuarios (filtrados según jerarquía)
 */
router.get('/', userController.getUsers.bind(userController));

/**
 * GET /api/users/:id
 * Obtener usuario por ID
 */
router.get('/:id', userController.getUser.bind(userController));

/**
 * POST /api/users
 * Crear nuevo usuario
 */
router.post('/', createUserValidators, userController.createUser.bind(userController));

/**
 * PUT /api/users/:id
 * Actualizar usuario
 */
router.put('/:id', updateUserValidators, userController.updateUser.bind(userController));

/**
 * PATCH /api/users/:id/toggle-status
 * Activar/desactivar usuario
 */
router.patch(
    '/:id/toggle-status',
    toggleStatusValidators,
    userController.toggleStatus.bind(userController)
);

/**
 * POST /api/users/bulk-toggle-status
 * Activar/desactivar múltiples usuarios
 */
router.post(
    '/bulk-toggle-status',
    bulkToggleStatusValidators,
    userController.bulkToggleStatus.bind(userController)
);

export default router;
