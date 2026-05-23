import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { dashboardService } from '../services/dashboard.service';

export const getDashboardStats = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;

        const stats = await dashboardService.getDashboardStats({
            businessId: req.query.businessId as string,
            startDate: req.query.startDate as string,
            endDate: req.query.endDate as string,
            userId,
            role,
        });

        return res.json(stats);
    } catch (error: any) {
        const message = error.message || 'Error al obtener estadísticas';
        const status = message.includes('permiso') ? 403 : 400;
        return res.status(status).json({ error: message });
    }
};
