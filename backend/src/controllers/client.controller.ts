import { Request, Response } from 'express';
import { ClientService } from '../services/client.service';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';

const clientService = new ClientService();

/**
 * Obtener todos los clientes
 */
export const getClients = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;
        const businessId = req.query.businessId as string;

        const clients = await clientService.getAllClients(userId, userRole, businessId);
        return res.json(clients);
    } catch (error: any) {
        console.error('Error getting clients:', error);
        return res.status(500).json({ error: error.message || 'Error al obtener clientes' });
    }
};

/**
 * Obtener cliente por ID
 */
export const getClientById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;

        const client = await clientService.getClientById(id, userId, userRole);
        return res.json(client);
    } catch (error: any) {
        console.error('Error getting client:', error);
        if (error.message === 'Cliente no encontrado') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message === 'No tiene permisos para ver este cliente') {
            return res.status(403).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message || 'Error al obtener cliente' });
    }
};

/**
 * Crear cliente
 */
export const createClient = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const client = await clientService.createClient(req.body, userId, userRole, ipAddress);
        return res.status(201).json(client);
    } catch (error: any) {
        console.error('Error creating client:', error);
        if (error.message.includes('Ya existe')) {
            return res.status(409).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message || 'Error al crear cliente' });
    }
};

/**
 * Actualizar cliente
 */
export const updateClient = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const client = await clientService.updateClient(id, req.body, userId, userRole, ipAddress);
        return res.json(client);
    } catch (error: any) {
        console.error('Error updating client:', error);
        if (error.message === 'Cliente no encontrado') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('Solo admin')) {
            return res.status(403).json({ error: error.message });
        }
        if (error.message.includes('Ya existe')) {
            return res.status(409).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message || 'Error al actualizar cliente' });
    }
};

/**
 * Eliminar cliente
 */
export const deleteClient = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const result = await clientService.deleteClient(id, userId, userRole, ipAddress);
        return res.json(result);
    } catch (error: any) {
        console.error('Error deleting client:', error);
        if (error.message === 'Cliente no encontrado') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('Solo admin')) {
            return res.status(403).json({ error: error.message });
        }
        return res.status(500).json({ error: error.message || 'Error al eliminar cliente' });
    }
};

/**
 * Buscar clientes
 */
export const searchClients = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;
        const query = req.query.q as string;
        const businessId = req.query.businessId as string;

        if (!query) {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        const clients = await clientService.searchClients(userId, userRole, query, businessId);
        return res.json(clients);
    } catch (error: any) {
        console.error('Error searching clients:', error);
        return res.status(500).json({ error: error.message || 'Error al buscar clientes' });
    }
};

/**
 * Importar múltiples clientes a otro negocio (batch)
 * Solo super_admin
 */
export const batchImportClients = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { clientIds, targetBusinessId } = req.body;
        const userId = req.user!.userId;
        const userRole = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        // Validaciones
        if (!targetBusinessId) {
            return res.status(400).json({ error: 'targetBusinessId es requerido' });
        }

        if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {
            return res.status(400).json({ error: 'Debe seleccionar al menos un cliente' });
        }

        const result = await clientService.batchImportClients(
            clientIds,
            targetBusinessId,
            userId,
            userRole,
            ipAddress
        );

        return res.status(200).json({
            success: result.success,
            message: `${result.imported} cliente(s) importado(s) exitosamente${result.failed > 0 ? `, ${result.failed} fallaron` : ''}`,
            data: result,
        });
    } catch (error: any) {
        console.error('Error importing clients:', error);

        if (error.message === 'Negocio destino no encontrado') {
            return res.status(404).json({ error: error.message });
        }
        if (error.message.includes('Solo super administradores')) {
            return res.status(403).json({ error: error.message });
        }
        if (error.message.includes('Debe seleccionar')) {
            return res.status(400).json({ error: error.message });
        }

        return res.status(500).json({ error: error.message || 'Error al importar clientes' });
    }
};
