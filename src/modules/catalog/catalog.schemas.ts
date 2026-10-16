import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';

const code = z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const name = z.string().trim().min(1).max(120);
const jsonObject: z.ZodType<Prisma.InputJsonObject> = z.record(z.string(), z.json());

export const createComponentTypeSchema = z.object({
  code,
  name,
  category: z.enum(['SENSOR', 'ACTUATOR', 'DISPLAY']),
  valueKind: z.enum(['NUMBER', 'BOOLEAN', 'STRING', 'JSON']),
  unit: z.string().trim().max(32).nullable().optional(),
  eventRules: jsonObject.nullable().optional()
});

export const updateComponentTypeSchema = z
  .object({
    code: code.optional(),
    name: name.optional(),
    category: z.enum(['SENSOR', 'ACTUATOR', 'DISPLAY']).optional(),
    valueKind: z.enum(['NUMBER', 'BOOLEAN', 'STRING', 'JSON']).optional(),
    unit: z.string().trim().max(32).nullable().optional(),
    eventRules: jsonObject.nullable().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export const createComponentModelSchema = z.object({
  typeId: z.number().int().positive(),
  code,
  name,
  manufacturer: z.string().trim().max(120).nullable().optional(),
  driver: code,
  defaultConfig: jsonObject.nullable().optional(),
  isActive: z.boolean().default(true)
});

export const updateComponentModelSchema = z
  .object({
    typeId: z.number().int().positive().optional(),
    code: code.optional(),
    name: name.optional(),
    manufacturer: z.string().trim().max(120).nullable().optional(),
    driver: code.optional(),
    defaultConfig: jsonObject.nullable().optional(),
    isActive: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export const catalogIdSchema = z.object({ id: z.coerce.number().int().positive() });

export type CreateComponentTypeInput = z.infer<typeof createComponentTypeSchema>;
export type UpdateComponentTypeInput = z.infer<typeof updateComponentTypeSchema>;
export type CreateComponentModelInput = z.infer<typeof createComponentModelSchema>;
export type UpdateComponentModelInput = z.infer<typeof updateComponentModelSchema>;
