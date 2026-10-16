import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import { createPackageSchema, packageListQuerySchema } from './packages.schemas';
import { createPackage, listPackageLockerOptions, listPackages } from './packages.service';
import {
  createPackageStreamTicketRoute,
  streamPackageUpdates
} from './package-stream.routes';

export const packagesRouter = Router();
packagesRouter.get('/stream', streamPackageUpdates);
packagesRouter.use(requireAuth);
packagesRouter.post(
  '/stream-ticket',
  requireRole('CLIENTE', 'DEPOSITANTE'),
  createPackageStreamTicketRoute
);

packagesRouter.get('/locker-options', requireRole('DEPOSITANTE'), async (_req, res) => {
  res.json({ lockers: await listPackageLockerOptions() });
});

packagesRouter.get('/', async (req, res) => {
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  const filters = packageListQuerySchema.parse(req.query);
  res.json({ packages: await listPackages(req.authUser, filters) });
});

packagesRouter.post('/', requireRole('DEPOSITANTE'), async (req, res) => {
  const input = createPackageSchema.parse(req.body);
  const packageRecord = await createPackage(input, req.authUser!.id_user);
  if (!packageRecord) {
    res.status(400).json({ message: 'Locker or active CLIENTE recipient not found' });
    return;
  }
  res.status(201).json({ package: packageRecord });
});
