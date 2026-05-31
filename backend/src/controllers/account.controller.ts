import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { UserRole } from '@prisma/client';
import { accountService } from '../services/account.service';

const statusFor = (msg: string) =>
    msg.includes('permiso') ? 403 : msg.includes('no encontrad') ? 404 : 400;

export const listAccounts = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const accounts = await accountService.listAccounts(req.query.businessId as string, req.user!.userId, req.user!.role as UserRole);
        return res.json(accounts);
    } catch (e: any) {
        return res.status(statusFor(e.message)).json({ error: e.message });
    }
};

export const getAccountBalances = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const data = await accountService.getBalances(req.query.businessId as string, req.user!.userId, req.user!.role as UserRole);
        return res.json(data);
    } catch (e: any) {
        return res.status(statusFor(e.message)).json({ error: e.message });
    }
};

export const createAccount = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const acc = await accountService.createAccount(req.body.businessId, req.body.name, req.body.type, req.user!.userId, req.user!.role as UserRole);
        return res.status(201).json(acc);
    } catch (e: any) {
        return res.status(statusFor(e.message)).json({ error: e.message });
    }
};

export const updateAccount = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const acc = await accountService.updateAccount(req.params.id, { name: req.body.name, type: req.body.type }, req.user!.userId, req.user!.role as UserRole);
        return res.json(acc);
    } catch (e: any) {
        return res.status(statusFor(e.message)).json({ error: e.message });
    }
};

export const deleteAccount = async (req: Request, res: Response) => {
    try {
        const result = await accountService.deleteAccount(req.params.id, { mode: req.body.mode, targetAccountId: req.body.targetAccountId }, req.user!.userId, req.user!.role as UserRole);
        return res.json(result);
    } catch (e: any) {
        return res.status(statusFor(e.message)).json({ error: e.message });
    }
};

// ─── Cierre diario ───
export const getTodayClose = async (req: Request, res: Response) => {
    try {
        const close = await accountService.getTodayClose(req.query.businessId as string, req.user!.userId, req.user!.role as UserRole);
        return res.json(close);
    } catch (e: any) { return res.status(statusFor(e.message)).json({ error: e.message }); }
};

export const listCloses = async (req: Request, res: Response) => {
    try {
        const closes = await accountService.listCloses(req.query.businessId as string, req.user!.userId, req.user!.role as UserRole);
        return res.json(closes);
    } catch (e: any) { return res.status(statusFor(e.message)).json({ error: e.message }); }
};

export const createClose = async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const close = await accountService.createClose(req.body.businessId, { countedBalances: req.body.countedBalances, notes: req.body.notes }, req.user!.userId, req.user!.role as UserRole, 'manual');
        return res.status(201).json(close);
    } catch (e: any) { return res.status(statusFor(e.message)).json({ error: e.message }); }
};

export const reopenClose = async (req: Request, res: Response) => {
    try {
        const close = await accountService.reopenClose(req.params.id, req.body.reason, req.user!.userId, req.user!.role as UserRole);
        return res.json(close);
    } catch (e: any) { return res.status(statusFor(e.message)).json({ error: e.message }); }
};

export const autoCloseRun = async (req: Request, res: Response) => {
    try {
        const secret = process.env.CRON_SECRET;
        const headerSecret = req.header('x-cron-secret');
        const bearer = req.header('authorization'); // Vercel Cron manda 'Bearer <CRON_SECRET>'
        const ok = !!secret && (headerSecret === secret || bearer === `Bearer ${secret}`);
        if (!ok) return res.status(401).json({ error: 'No autorizado' });
        const result = await accountService.autoCloseAll();
        return res.json(result);
    } catch (e: any) { return res.status(400).json({ error: e.message }); }
};
