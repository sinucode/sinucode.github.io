import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { creditService } from '../services/credit.service';

export const simulateCredit = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const simulation = await creditService.simulateCredit({
            ...req.body,
            amount: Number(req.body.amount),
            interestRate: Number(req.body.interestRate),
            termDays: Number(req.body.termDays),
        });
        return res.json(simulation);
    } catch (error: any) {
        console.error('Error simulando crédito:', error);
        return res.status(500).json({ error: error.message || 'Error al simular crédito' });
    }
};

export const createCredit = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const credit = await creditService.createCredit(
            {
                ...req.body,
                amount: Number(req.body.amount),
                interestRate: Number(req.body.interestRate),
                termDays: Number(req.body.termDays),
            },
            userId,
            role,
            ipAddress
        );
        return res.status(201).json(credit);
    } catch (error: any) {
        console.error('Error creando crédito:', error);
        if (error.message?.includes('monto excede')) {
            return res.status(409).json({ error: error.message });
        }
        return res.status(400).json({ error: error.message || 'Error al crear crédito' });
    }
};

export const listCredits = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const filters = {
            businessId: req.query.businessId as string,
            status: req.query.status as string,
            dueToday: req.query.dueToday === 'true',
            overdue: req.query.overdue === 'true',
        };
        const credits = await creditService.listCredits(userId, role, filters);
        return res.json(credits);
    } catch (error: any) {
        console.error('Error listando créditos:', error);
        return res.status(400).json({ error: error.message || 'Error al obtener créditos' });
    }
};

export const getCreditById = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const { id } = req.params;
        const credit = await creditService.getCreditById(id, userId, role);
        return res.json(credit);
    } catch (error: any) {
        console.error('Error obteniendo crédito:', error);
        if (error.message?.includes('permisos')) {
            return res.status(403).json({ error: error.message });
        }
        return res.status(404).json({ error: error.message || 'Crédito no encontrado' });
    }
};

export const updateCreditSchedule = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const { id } = req.params;
        const schedules = req.body.schedules;
        const credit = await creditService.updateCreditSchedule(id, schedules, userId, role);
        return res.json(credit);
    } catch (error: any) {
        console.error('Error actualizando plan de pagos:', error);
        const message = error.message || 'Error al actualizar crédito';
        const status = message.includes('permiso') ? 403 : 400;
        return res.status(status).json({ error: message });
    }
};
