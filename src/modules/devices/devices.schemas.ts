import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';

const deviceCode = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const jsonObject: z.ZodType<Prisma.InputJsonObject> = z.record(z.string(), z.json());

export const deviceIdSchema = z.object({ id: z.coerce.number().int().positive() });
export const deviceCodeSchema = z.object({ code: deviceCode });

export const createDeviceSchema = z.object({
  code: deviceCode,
  lockerId: z.number().int().positive(),
  boardModel: z.string().trim().min(1).max(100).default('ESP32-38pin')
});

export const updateDeviceSchema = z
  .object({
    lockerId: z.number().int().positive().optional(),
    boardModel: z.string().trim().min(1).max(100).optional(),
    isActive: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export const createComponentSchema = z.object({
  modelId: z.number().int().positive(),
  key: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  name: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.json()),
  calibration: z.record(z.string(), z.json()).nullable().optional(),
  isEnabled: z.boolean().default(true)
});

export const updateComponentSchema = z
  .object({
    modelId: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(120).optional(),
    config: z.record(z.string(), z.json()).optional(),
    calibration: z.record(z.string(), z.json()).nullable().optional(),
    isEnabled: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export type CreateDeviceInput = z.infer<typeof createDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type CreateComponentInput = z.infer<typeof createComponentSchema>;
export type UpdateComponentInput = z.infer<typeof updateComponentSchema>;
