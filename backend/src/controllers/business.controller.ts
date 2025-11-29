import { Request, Response } from 'express';
import { businessService } from '../services/business.service';
import { validationResult } from 'express-validator';

/**
 * Controlador de negocios
 */
export class BusinessController {
    /**
     * GET /api/businesses
     * Obtener todos los negocios
     * Implementa filtrado basado en rol
     */
    async getBusinesses(req: Request, res: Response) {
        try {
            const userId = req.user?.userId;
            const role = req.user?.role as 'user' | 'admin' | 'super_admin' | undefined;

            const businesses = await businessService.getAllBusinesses(userId, role);
            return res.json(businesses);
        } catch (error: any) {
            console.error('Error getting businesses:', error);
            return res.status(500).json({ error: error.message || 'Failed to get businesses' });
        }
    }

    /**
     * GET /api/businesses/:id
     * Obtener negocio por ID
     */
    async getBusiness(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const business = await businessService.getBusinessById(id);
            return res.json(business);
        } catch (error: any) {
            console.error('Error getting business:', error);
            if (error.message === 'Business not found') {
                return res.status(404).json({ error: error.message });
            } else {
                return res.status(500).json({ error: error.message || 'Failed to get business' });
            }
        }
    }

    /**
     * POST /api/businesses
     * Crear nuevo negocio
     */
    async createBusiness(req: Request, res: Response) {
        try {
            // Validar
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { name, description, initialCapital } = req.body;
            const requestingUserId = req.user!.userId;
            const ipAddress = req.ip || req.socket.remoteAddress || '';

            const business = await businessService.createBusiness(
                { name, description, initialCapital },
                requestingUserId,
                ipAddress
            );

            return res.status(201).json(business);
        } catch (error: any) {
            console.error('Error creating business:', error);
            return res.status(400).json({ error: error.message || 'Failed to create business' });
        }
    }

    /**
     * PUT /api/businesses/:id
     * Actualizar negocio
     */
    async updateBusiness(req: Request, res: Response) {
        try {
            // Validar
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const { id } = req.params;
            const { name, description, initialCapital } = req.body;
            const requestingUserId = req.user!.userId;
            const ipAddress = req.ip || req.socket.remoteAddress || '';

            const business = await businessService.updateBusiness(
                id,
                { name, description, initialCapital },
                requestingUserId,
                ipAddress
            );

            return res.json(business);
        } catch (error: any) {
            console.error('Error updating business:', error);
            if (error.message === 'Business not found') {
                return res.status(404).json({ error: error.message });
            } else {
                return res.status(400).json({ error: error.message || 'Failed to update business' });
            }
        }
    }

    /**
     * DELETE /api/businesses/:id
     * Eliminar negocio
     */
    async deleteBusiness(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const requestingUserId = req.user!.userId;
            const ipAddress = req.ip || req.socket.remoteAddress || '';

            const result = await businessService.deleteBusiness(id, requestingUserId, ipAddress);
            return res.json(result);
        } catch (error: any) {
            console.error('Error deleting business:', error);
            if (error.message === 'Business not found') {
                return res.status(404).json({ error: error.message });
            } else {
                return res.status(400).json({ error: error.message || 'Failed to delete business' });
            }
        }
    }
}

export const businessController = new BusinessController();
