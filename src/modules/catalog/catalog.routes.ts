import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import {
  catalogIdSchema,
  createComponentModelSchema,
  createComponentTypeSchema,
  updateComponentModelSchema,
  updateComponentTypeSchema
} from './catalog.schemas';
import {
  createComponentModel,
  createComponentType,
  listComponentModels,
  listComponentTypes,
  updateComponentModel,
  updateComponentType
} from './catalog.service';

export const catalogRouter = Router();
catalogRouter.use(requireAuth);

catalogRouter.get('/types', async (_req, res) => {
  res.json({ types: await listComponentTypes() });
});
catalogRouter.post('/types', requireRole('ADMIN'), async (req, res) => {
  const type = await createComponentType(createComponentTypeSchema.parse(req.body));
  res.status(201).json({ type });
});
catalogRouter.patch('/types/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = catalogIdSchema.parse(req.params);
  const type = await updateComponentType(id, updateComponentTypeSchema.parse(req.body));
  res.json({ type });
});

catalogRouter.get('/models', async (_req, res) => {
  res.json({ models: await listComponentModels() });
});
catalogRouter.post('/models', requireRole('ADMIN'), async (req, res) => {
  const model = await createComponentModel(createComponentModelSchema.parse(req.body));
  res.status(201).json({ model });
});
catalogRouter.patch('/models/:id', requireRole('ADMIN'), async (req, res) => {
  const { id } = catalogIdSchema.parse(req.params);
  const model = await updateComponentModel(id, updateComponentModelSchema.parse(req.body));
  res.json({ model });
});
