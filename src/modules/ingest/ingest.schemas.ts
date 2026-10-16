import { z } from 'zod';

const readingValue = z.json();

export const ingestReadingsSchema = z.object({
  deviceCode: z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/),
  firmware: z.string().trim().min(1).max(80).optional(),
  readings: z.array(z.object({
    component: z.string().trim().min(1).max(100),
    value: readingValue,
    quality: z.enum(['OK', 'OUT_OF_RANGE', 'ERROR']).default('OK'),
    purpose: z.enum(['PERIODIC', 'DOOR_CLOSE']).default('PERIODIC'),
    ts: z.number().finite().positive().optional()
  })).min(1).max(500)
});

export type IngestReadingsInput = z.infer<typeof ingestReadingsSchema>;
export type IncomingReading = IngestReadingsInput['readings'][number];
