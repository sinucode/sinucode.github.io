import { Router } from 'express';
import { authenticate, requireMinRole } from '../middleware/auth.middleware';
import {
    getClients,
    getClientById,
    createClient,
    updateClient,
    deleteClient,
    searchClients,
    copyClient
} from '../controllers/client.controller';
import { createClientValidators, updateClientValidators } from '../validators/client.validators';

const router = Router();

// Todas las rutas requieren autenticación
router.use(authenticate);

// Rutas accesibles por rol 'user' (y superiores)
router.get('/', requireMinRole('user'), getClients);
router.get('/search', requireMinRole('user'), searchClients);
router.get('/:id', requireMinRole('user'), getClientById);
router.post('/', requireMinRole('user'), createClientValidators, createClient);

// Rutas restringidas a 'admin' y 'super_admin'
router.put('/:id', requireMinRole('admin'), updateClientValidators, updateClient);
router.delete('/:id', requireMinRole('admin'), deleteClient);

// Ruta exclusiva para 'super_admin' - Copiar cliente
router.post('/:id/copy', requireMinRole('super_admin'), copyClient);

export default router;

