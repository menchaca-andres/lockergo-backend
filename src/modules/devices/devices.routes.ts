import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import { deviceCodeSchema } from './devices.schemas';
import {
  createComponentSchema,
  createDeviceSchema,
  deviceIdSchema,
  updateComponentSchema,
  updateDeviceSchema
} from './devices.schemas';
import {
  createDevice,
  createDeviceComponent,
  deviceExists,
  listDeviceComponents,
  listDevices,
  rotateDeviceKey,
  updateComponent,
  updateDevice,
  getDeviceConfig,
  resolveDeviceAccess
} from './devices.service';

export const deviceConfigRouter = Router();
deviceConfigRouter.get('/:code/config', async (req, res) => {
  const { code } = deviceCodeSchema.parse(req.params);
  const apiKey = req.get('x-device-key');
  if (!(await resolveDeviceAccess(code, apiKey))) {
    res.status(401).json({ message: 'Device authentication required' });
    return;
  }

  const config = await getDeviceConfig(code);
  if (!config) {
    res.status(404).json({ message: 'Device configuration not found' });
    return;
  }
  res.json(config);
});

export const devicesRouter = Router();
devicesRouter.use(requireAuth, requireRole('ADMIN'));

devicesRouter.get('/', async (_req, res) => {
  res.json({ devices: await listDevices() });
});

devicesRouter.post('/', async (req, res) => {
  const result = await createDevice(createDeviceSchema.parse(req.body));
  if (!result) {
    res.status(400).json({ message: 'Locker does not exist or is inactive' });
    return;
  }
  res.status(201).json(result);
});

devicesRouter.patch('/:id', async (req, res) => {
  const { id } = deviceIdSchema.parse(req.params);
  const device = await updateDevice(id, updateDeviceSchema.parse(req.body));
  if (!device) {
    res.status(400).json({ message: 'Locker does not exist or is inactive' });
    return;
  }
  res.json({ device });
});

devicesRouter.post('/:id/rotate-key', async (req, res) => {
  const { id } = deviceIdSchema.parse(req.params);
  res.json(await rotateDeviceKey(id));
});

devicesRouter.get('/:id/components', async (req, res) => {
  const { id } = deviceIdSchema.parse(req.params);
  if (!(await deviceExists(id))) {
    res.status(404).json({ message: 'Device not found' });
    return;
  }
  res.json({ components: await listDeviceComponents(id) });
});

devicesRouter.post('/:id/components', async (req, res) => {
  const { id } = deviceIdSchema.parse(req.params);
  const component = await createDeviceComponent(id, createComponentSchema.parse(req.body));
  if (!component) {
    if (!(await deviceExists(id))) {
      res.status(404).json({ message: 'Device not found' });
      return;
    }
    res.status(400).json({ message: 'Component model does not exist or is inactive' });
    return;
  }
  res.status(201).json({ component });
});

export const componentsRouter = Router();
componentsRouter.use(requireAuth, requireRole('ADMIN'));
componentsRouter.patch('/:id', async (req, res) => {
  const { id } = deviceIdSchema.parse(req.params);
  const result = await updateComponent(id, updateComponentSchema.parse(req.body), req.authUser!.id_user);
  if (result === null) {
    res.status(404).json({ message: 'Component not found' });
    return;
  }
  if (result === false) {
    res.status(400).json({ message: 'Component model does not exist or is inactive' });
    return;
  }
  res.json({ component: result });
});
