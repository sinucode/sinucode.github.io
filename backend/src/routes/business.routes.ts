import { Router } from 'express';
import { businessController } from '../controllers/business.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import {
    createBusinessValidators,
    updateBusinessValidators,
} from '../validators/business.validators';

const router = Router();

// Todas las rutas de negocios son exclusivas de super_admin
router.use(authenticate);
router.use(requireMinRole('super_admin'));

/**
 * GET /api/businesses
 * Obtener todos los negocios
 */
router.get('/', businessController.getBusinesses.bind(businessController));

/**
 * GET /api/businesses/:id
 * Obtener negocio por ID
 */
router.get('/:id', businessController.getBusiness.bind(businessController));

/**
 * POST /api/businesses
 * Crear nuevo negocio — solo super_admin
 */
router.post('/', requireMinRole('super_admin'), createBusinessValidators, businessController.createBusiness.bind(businessController));

/**
 * PUT /api/businesses/:id
 * Actualizar negocio — admin puede editar el suyo (verificación en servicio)
 */
router.put('/:id', updateBusinessValidators, businessController.updateBusiness.bind(businessController));

/**
 * DELETE /api/businesses/:id
 * Eliminar negocio — solo super_admin
 */
router.delete('/:id', requireMinRole('super_admin'), businessController.deleteBusiness.bind(businessController));

export default router;
