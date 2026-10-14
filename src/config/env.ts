import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(8),
    JWT_REFRESH_SECRET: z.string().min(8),
    CORS_ORIGIN: z.string().default('http://localhost:4200'),
    DEVICE_OFFLINE_SECONDS: z.coerce.number().default(120)
  })
  .superRefine((config, context) => {
    if (config.JWT_SECRET === config.JWT_REFRESH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_SECRET and JWT_REFRESH_SECRET must be different'
      });
    }

    if (
      config.NODE_ENV === 'production' &&
      (Buffer.byteLength(config.JWT_SECRET) < 32 ||
        Buffer.byteLength(config.JWT_REFRESH_SECRET) < 32)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'Production JWT secrets must each contain at least 32 bytes'
      });
    }
  });

export const env = envSchema.parse(process.env);
