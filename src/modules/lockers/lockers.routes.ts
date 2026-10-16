import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import {
  createLockerSchema,
  lockerEventsQuerySchema,
  lockerAnalyticsQuerySchema,
  lockerHistoryQuerySchema,
  lockerIdSchema,
  updateLockerSchema
} from './lockers.schemas';
import {
  getLockerState,
  listLockerEvents,
  listLockerOverview,
  listLockerReadings
} from './locker-live.service';
import { createStreamTicket, streamLockerUpdates } from './locker-stream.routes';
import { createLocker, getLocker, listLockers, updateLocker } from './lockers.service';
import { getLockerAnalytics } from './locker-analytics.service';

export const lockersRouter = Router();
lockersRouter.get('/:id/stream', streamLockerUpdates);
lockersRouter.use(requireAuth);

lockersRouter.get('/', async (req, res) => {
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  res.json({ lockers: await listLockers(req.authUser) });
});

lockersRouter.get('/overview', async (req, res) => {
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  res.json({ lockers: await listLockerOverview(req.authUser) });
});

lockersRouter.post('/', requireRole('ADMIN'), async (req, res) => {
  const locker = await createLocker(createLockerSchema.parse(req.body));
  res.status(201).json({ locker });
});

lockersRouter.post('/:id/stream-ticket', createStreamTicket);

lockersRouter.get('/:id/state', async (req, res) => {
  const { id } = lockerIdSchema.parse(req.params);
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  const state = await getLockerState(req.authUser, id);
  if (!state) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }
  res.json(state);
});

lockersRouter.get('/:id/readings', async (req, res) => {
  const { id } = lockerIdSchema.parse(req.params);
  const filters = lockerHistoryQuerySchema.parse(req.query);
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  const readings = await listLockerReadings(req.authUser, id, filters);
  if (!readings) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }
  res.json(readings);
});

lockersRouter.get('/:id/events', async (req, res) => {
  const { id } = lockerIdSchema.parse(req.params);
  const filters = lockerEventsQuerySchema.parse(req.query);
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  const events = await listLockerEvents(req.authUser, id, filters);
  if (!events) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }
  res.json({ events });
});

lockersRouter.get('/:id/analytics', requireRole('ADMIN'), async (req, res) => {
  const { id } = lockerIdSchema.parse(req.params);
  const filters = lockerAnalyticsQuerySchema.parse(req.query);
  const analytics = await getLockerAnalytics(id, filters);
  if (!analytics) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }
  res.json(analytics);
});

lockersRouter.get('/:id', async (req, res) => {
  const { id } = lockerIdSchema.parse(req.params);
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  const locker = await getLocker(req.authUser, id);
  if (!locker) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }
  res.json({ locker });
});

lockersRouter.patch('/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = lockerIdSchema.parse(req.params);
  const locker = await updateLocker(id, updateLockerSchema.parse(req.body));
  res.json({ locker });
});
