import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware';
import { requireRole } from '../auth/require-role.middleware';
import { assignLockersSchema, createUserSchema, updateUserSchema, userIdSchema } from './users.schemas';
import {
  createUser,
  getUser,
  listUsers,
  replaceUserLockerAssignments,
  updateUser
} from './users.service';

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole('ADMIN'));

usersRouter.get('/', async (_req, res) => {
  res.json({ users: await listUsers() });
});

usersRouter.post('/', async (req, res) => {
  const input = createUserSchema.parse(req.body);
  const user = await createUser(input);
  res.status(201).json({ user });
});

usersRouter.get('/:id', async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  const user = await getUser(id);
  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  res.json({ user });
});

usersRouter.patch('/:id', async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  const input = updateUserSchema.parse(req.body);

  if (
    id === req.authUser?.id_user &&
    (input.isActive === false || (input.role !== undefined && input.role !== 'ADMIN'))
  ) {
    res.status(400).json({ message: 'You cannot deactivate or demote your own account' });
    return;
  }

  const user = await updateUser(id, input);
  res.json({ user });
});

usersRouter.put('/:id/lockers', async (req, res) => {
  const { id } = userIdSchema.parse(req.params);
  const { lockerIds } = assignLockersSchema.parse(req.body);
  const user = await getUser(id);

  if (!user) {
    res.status(404).json({ message: 'User not found' });
    return;
  }
  if (user.role !== 'CLIENTE') {
    res.status(400).json({ message: 'Lockers can only be assigned to CLIENTE accounts' });
    return;
  }

  const updated = await replaceUserLockerAssignments(id, lockerIds);
  if (!updated) {
    res.status(400).json({ message: 'One or more lockers do not exist or are inactive' });
    return;
  }

  res.json({ user: await getUser(id) });
});
