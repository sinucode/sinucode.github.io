import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { creditService } from '../services/credit.service';
import { AppError } from '../utils/AppError';

function handleError(res: Response, error: any, fallback: string, defaultStatus = 400) {
    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            error: error.message,
            code: error.code,
            ...(error.details && { details: error.details }),
        });
    }
    // Mantener compatibilidad con los codes existentes (INSUFFICIENT_*, NO_COLLECTION_DAYS)
    if (error.code) {
        return res.status(400).json({
            error: error.message,
            code: error.code,
            ...(error.details && { details: error.details }),
        });
    }
    const status = error.message?.includes('permiso') || error.message?.includes('Super Admin') ? 403
        : error.message?.includes('encontrad') ? 404
        : defaultStatus;
    return res.status(status).json({ error: error.message || fallback });
}

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
            excludedWeekdays: Array.isArray(req.body.excludedWeekdays)
                ? req.body.excludedWeekdays.map(Number)
                : undefined,
            excludeHolidays: req.body.excludeHolidays === true || req.body.excludeHolidays === 'true',
            customRounding: req.body.customRounding === true || req.body.customRounding === 'true',
        });
        return res.json(simulation);
    } catch (error: any) {
        console.error('Error simulando crédito:', error);
        return handleError(res, error, 'Error al simular crédito', 500);
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
                accountId: req.body.accountId || undefined,
                splits: Array.isArray(req.body.splits)
                    ? req.body.splits.map((s: any) => ({ accountId: s.accountId, amount: Number(s.amount) }))
                    : undefined,
                financings: Array.isArray(req.body.financings)
                    ? req.body.financings.map((f: any) => ({
                        creditId:   f.creditId,
                        scheduleId: f.scheduleId || undefined,
                        amount:     Number(f.amount),
                    }))
                    : undefined,
                excludedWeekdays: Array.isArray(req.body.excludedWeekdays)
                    ? req.body.excludedWeekdays.map(Number)
                    : undefined,
                excludeHolidays: req.body.excludeHolidays === true || req.body.excludeHolidays === 'true',
                customRounding: req.body.customRounding === true || req.body.customRounding === 'true',
            },
            userId,
            role,
            ipAddress
        );
        return res.status(201).json(credit);
    } catch (error: any) {
        console.error('Error creando crédito:', error);
        return handleError(res, error, 'Error al crear crédito');
    }
};

export const listCredits = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const filters = {
            businessId: req.query.businessId as string,
            clientId: req.query.clientId as string | undefined,
            status: req.query.status as string,
            dueToday: req.query.dueToday === 'true',
            overdue: req.query.overdue === 'true',
        };
        const credits = await creditService.listCredits(userId, role, filters);
        return res.json(credits);
    } catch (error: any) {
        console.error('Error listando créditos:', error);
        return handleError(res, error, 'Error al obtener créditos');
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
        return handleError(res, error, 'Crédito no encontrado', 404);
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
        const { schedules, amount, interestRate, termDays, frequency, startDate } = req.body;
        const credit = await creditService.updateCreditSchedule({
            creditId: id,
            schedules,
            userId,
            role,
            amount: amount ? Number(amount) : undefined,
            interestRate: interestRate ? Number(interestRate) : undefined,
            termDays: termDays ? Number(termDays) : undefined,
            frequency,
            startDate
        });
        return res.json(credit);
    } catch (error: any) {
        console.error('Error actualizando plan de pagos:', error);
        return handleError(res, error, 'Error al actualizar crédito');
    }
};

export const bulkDeleteCredits = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { creditIds } = req.body;
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        if (!Array.isArray(creditIds) || creditIds.length === 0) {
            return res.status(400).json({ error: 'Debe enviar un arreglo de creditIds válido' });
        }

        const result = await creditService.bulkDeleteCredits(creditIds, userId, role, ipAddress);

        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error: any) {
        console.error('Error en eliminación masiva de créditos:', error);
        return handleError(res, error, 'Error al eliminar créditos', 500);
    }
};
export const deleteCredit = async (req: Request, res: Response) => {
    try {
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const { id } = req.params;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const result = await creditService.deleteCredit(id, userId, role, ipAddress);
        return res.json(result);
    } catch (error: any) {
        console.error('Error eliminando crédito:', error);
        return handleError(res, error, 'Error al eliminar el crédito');
    }
};

export const revertInstallment = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { creditId, scheduleId } = req.params;
        const { amountToRevert } = req.body;
        const userId = req.user!.userId;
        const role = req.user!.role as UserRole;
        const ipAddress = req.ip || req.socket.remoteAddress || '';

        const result = await creditService.revertInstallment(
            creditId,
            scheduleId,
            Number(amountToRevert),
            userId,
            role,
            ipAddress
        );

        return res.json(result);
    } catch (error: any) {
        console.error('Error revertiendo cuota:', error);
        return handleError(res, error, 'Error al revertir la cuota');
    }
};
