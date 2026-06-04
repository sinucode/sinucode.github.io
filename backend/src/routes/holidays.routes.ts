import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import { syncHolidaysController, getHolidaysController } from '../controllers/holiday.controller';

const router = Router();

/**
 * Middleware compartido para el endpoint de sincronización:
 * acepta x-cron-secret o Authorization: Bearer <CRON_SECRET> (Vercel Cron),
 * o super_admin autenticado.
 */
function cronOrSuperAdmin(req: Request, res: Response, next: NextFunction): void {
    const cronSecret = process.env.CRON_SECRET;
    const headerSecret = req.headers['x-cron-secret'] as string | undefined;
    const bearer = req.headers['authorization'];
    const cronMatch = !!cronSecret && (
        headerSecret === cronSecret ||
        bearer === `Bearer ${cronSecret}`
    );
    if (cronMatch) { next(); return; }
    // No es cron: exige super_admin autenticado
    authenticate(req, res, () => requireMinRole('super_admin')(req, res, next));
}

router.post('/sync', cronOrSuperAdmin, syncHolidaysController);
router.get('/', authenticate, getHolidaysController);

export default router;
