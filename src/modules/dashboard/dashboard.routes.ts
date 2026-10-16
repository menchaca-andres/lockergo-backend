import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import { getAdminDashboardOverview } from './dashboard.service';
import { adminDashboardQuerySchema } from './dashboard.schemas';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth);

dashboardRouter.get('/admin/overview', requireRole('ADMIN'), async (req, res) => {
  const { timezone } = adminDashboardQuerySchema.parse(req.query);
  res.json(await getAdminDashboardOverview(timezone));
});
