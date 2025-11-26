import { Router } from 'express';
import { businessController } from '../controllers/business.controller';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import {
    createBusinessValidators,
    updateBusinessValidators,
} from '../validators/business.validators';

const router = Router();

// Todas las rutas requieren autenticación y al menos rol admin
router.use(authenticate);
router.use(requireMinRole('admin'));

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
 * Crear nuevo negocio
 */
router.post('/', createBusinessValidators, businessController.createBusiness.bind(businessController));

/**
 * PUT /api/businesses/:id
 * Actualizar negocio
 */
router.put('/:id', updateBusinessValidators, businessController.updateBusiness.bind(businessController));

/**
 * DELETE /api/businesses/:id
 * Eliminar negocio
 */
router.delete('/:id', businessController.deleteBusiness.bind(businessController));

export default router;
