import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import { getAdminDashboardOverview } from './dashboard.service';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/admin/overview', requireRole('ADMIN'), async (_req, res) => {
  res.json(await getAdminDashboardOverview());
});
