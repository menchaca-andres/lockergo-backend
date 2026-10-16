import { z } from 'zod';

const packageCode = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);

export const createPackageSchema = z.object({
  code: packageCode,
  lockerId: z.number().int().positive(),
  clientEmail: z.string().trim().toLowerCase().pipe(z.email())
});

export const packageListQuerySchema = z.object({
  status: z.enum(['PENDING', 'PICKED_UP']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
});

export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type PackageListQuery = z.infer<typeof packageListQuerySchema>;
