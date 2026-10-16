import { z } from 'zod';

const code = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
const name = z.string().trim().min(1).max(120);
const location = z.string().trim().max(200).nullable();

export const lockerIdSchema = z.object({ id: z.coerce.number().int().positive() });

const queryDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const queryFilters = {
  from: queryDate.optional(),
  to: queryDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100)
};

export const lockerHistoryQuerySchema = z.object({
  ...queryFilters,
  componentId: z.coerce.number().int().positive().optional(),
  type: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1)
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: 'from must be earlier than or equal to to',
  path: ['to']
});

export const lockerEventsQuerySchema = z.object({
  ...queryFilters,
  type: z.string().trim().min(1).max(100).optional(),
  severity: z.enum(['INFO', 'WARNING', 'CRITICAL']).optional()
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: 'from must be earlier than or equal to to',
  path: ['to']
});

export const lockerAnalyticsQuerySchema = z.object({
  ...queryFilters
}).refine(({ from, to }) => !from || !to || from <= to, {
  message: 'from must be earlier than or equal to to',
  path: ['to']
});

export const createLockerSchema = z.object({
  code,
  name,
  location: location.optional()
});

export const updateLockerSchema = z
  .object({
    code: code.optional(),
    name: name.optional(),
    location: location.optional(),
    isActive: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one field must be provided');

export type CreateLockerInput = z.infer<typeof createLockerSchema>;
export type UpdateLockerInput = z.infer<typeof updateLockerSchema>;
