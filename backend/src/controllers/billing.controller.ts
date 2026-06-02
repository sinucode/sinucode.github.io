import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { billingService } from '../services/billing.service';

export const getCreditsSummary = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    try {
        const { startDate, endDate } = req.query as { startDate: string; endDate: string };
        const summary = await billingService.getCreditsSummary(startDate, endDate);
        res.json(summary);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const updateBusinessPrice = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    try {
        const { businessId } = req.params;
        const { pricePerUnit } = req.body;
        await billingService.updateBusinessPrice(businessId, Number(pricePerUnit));
        res.json({ ok: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const createBilling = async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return; }

    try {
        const userId = (req as any).user?.id;
        const billing = await billingService.createBilling(req.body, userId);
        res.status(201).json(billing);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};

export const listBillings = async (req: Request, res: Response) => {
    try {
        const { businessId, startDate, endDate } = req.query as Record<string, string>;
        const billings = await billingService.listBillings({ businessId, startDate, endDate });
        res.json(billings);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
};
