import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).refine((password) => Buffer.byteLength(password, 'utf8') <= 72)
});

export type LoginInput = z.infer<typeof loginSchema>;
