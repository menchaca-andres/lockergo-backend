import { z } from 'zod';

const userName = z.string().trim().min(1).max(120);
const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z
  .string()
  .min(12)
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72);
const userId = z.coerce.number().int().positive();

export const userIdSchema = z.object({ id: userId });

export const createUserSchema = z.object({
  name: userName,
  email,
  password,
  role: z.enum(['ADMIN', 'USER']).default('USER')
});

export const updateUserSchema = z
  .object({
    name: userName.optional(),
    email: email.optional(),
    password: password.optional(),
    role: z.enum(['ADMIN', 'USER']).optional(),
    isActive: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export const assignLockersSchema = z.object({
  lockerIds: z.array(z.number().int().positive()).max(500)
    .refine((ids) => new Set(ids).size === ids.length, 'Locker IDs must be unique')
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
