import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { titheService } from '../services/tithe.service';

const statusFor = (message: string) =>
    message.includes('Super Admin') || message.includes('permiso') ? 403
        : message.includes('no encontrado') ? 404
            : message.includes('Fondos insuficientes') ? 409
                : 400;

export const getTitheSummary = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const role = req.user!.role as UserRole;
        const summary = await titheService.getSummary(req.query.businessId as string, role);
        return res.json(summary);
    } catch (error: any) {
        const message = error.message || 'Error al obtener el resumen de diezmo';
        return res.status(statusFor(message)).json({ error: message });
    }
};

export const payTithe = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const result = await titheService.payTithe({
            businessId: req.body.businessId,
            creditIds: req.body.creditIds,
            userId,
            role,
            ipAddress,
        });
        return res.status(201).json(result);
    } catch (error: any) {
        const message = error.message || 'Error al pagar el diezmo';
        return res.status(statusFor(message)).json({ error: message });
    }
};
