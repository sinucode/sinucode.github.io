import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { creditService } from '../services/credit.service';
import { paymentService } from '../services/payment.service';
import { AppError } from '../utils/AppError';

function handlePaymentError(res: Response, error: any, fallback: string) {
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            error: error.message,
            code: error.code,
            ...(error.details && { details: error.details }),
        });
    }
    const msg = error.message || fallback;
    const status = msg.includes('permiso') ? 403 : msg.includes('excede') ? 409 : 400;
    return res.status(status).json({ error: msg });
}

export const registerPayment = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const payment = await creditService.registerPayment({
            creditId: req.body.creditId,
            amount: Number(req.body.amount),
            paymentDate: req.body.paymentDate,
            paymentMethod: req.body.paymentMethod,
            notes: req.body.notes,
            scheduleId: req.body.scheduleId,
            accountId: req.body.accountId,
            excessAction: req.body.excessAction,
            userId,
            role,
            ipAddress,
        });

        return res.status(201).json(payment);
    } catch (error: any) {
        console.error('Error registrando pago:', error);
        return handlePaymentError(res, error, 'Error al registrar pago');
    }
};

export const listPayments = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const filters = {
            businessId: req.query.businessId as string,
            startDate: req.query.startDate as string,
            endDate: req.query.endDate as string,
            paymentMethod: req.query.paymentMethod as string,
        };

        const payments = await paymentService.listPayments(userId, role, filters);
        return res.json(payments);
    } catch (error: any) {
        return handlePaymentError(res, error, 'Error al obtener pagos');
    }
};
