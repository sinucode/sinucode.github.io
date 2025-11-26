import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { cashService } from '../services/cash.service';

export const recordMovement = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const movement = await cashService.recordMovement(
            {
                businessId: req.body.businessId,
                type: req.body.type,
                amount: Number(req.body.amount),
                description: req.body.description,
                relatedCreditId: req.body.relatedCreditId,
                relatedPaymentId: req.body.relatedPaymentId,
            },
            userId,
            role
        );
        return res.status(201).json(movement);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error al registrar movimiento' });
    }
};

export const injectCapital = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const movement = await cashService.injectCapital(
            req.body.businessId,
            Number(req.body.amount),
            req.body.description,
            userId,
            role
        );
        return res.status(201).json(movement);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error al inyectar capital' });
    }
};

export const withdrawFunds = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const movement = await cashService.withdrawFunds(
            req.body.businessId,
            Number(req.body.amount),
            req.body.description,
            userId,
            role
        );
        return res.status(201).json(movement);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error al retirar fondos' });
    }
};

export const getCashFlow = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const { businessId, startDate, endDate } = req.query as any;
        if (!businessId) return res.status(400).json({ error: 'businessId es requerido' });
        const result = await cashService.getCashFlow(
            { businessId, startDate, endDate },
            userId,
            role
        );
        return res.json(result);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error al obtener flujo de caja' });
    }
};

export const reconcile = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const { businessId } = req.query as any;
        if (!businessId) return res.status(400).json({ error: 'businessId es requerido' });
        const result = await cashService.reconcile(businessId, userId, role);
        return res.json(result);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error al conciliar caja' });
    }
};

export const forecastCash = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const { businessId, targetDate } = req.query as any;
        if (!businessId || !targetDate) return res.status(400).json({ error: 'businessId y targetDate son requeridos' });
        const result = await cashService.forecast(businessId, new Date(targetDate), userId, role);
        return res.json(result);
    } catch (error: any) {
        return res.status(400).json({ error: error.message || 'Error al proyectar caja' });
    }
};
