import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireMinRole } from '../middleware/roleHierarchy.middleware';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { dashboardStatsValidators } from '../validators/dashboard.validators';

const router = Router();

router.use(authenticate);

// GET /api/dashboard/stats?businessId=X&startDate=Y&endDate=Z
router.get('/stats', requireMinRole('user'), dashboardStatsValidators, getDashboardStats);

export default router;
