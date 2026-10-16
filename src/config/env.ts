import { config } from 'dotenv';
import { z } from 'zod';

config();

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(8),
    JWT_REFRESH_SECRET: z.string().min(8),
    CORS_ORIGIN: z.string().default('http://localhost:4200'),
    DEVICE_OFFLINE_SECONDS: z.coerce.number().default(120),
    ALLOW_UNAUTHENTICATED_DEVICE_ACCESS: z.enum(['true', 'false']).default('false').transform((value) => value === 'true')
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

    if (config.ALLOW_UNAUTHENTICATED_DEVICE_ACCESS && config.NODE_ENV !== 'development') {
      context.addIssue({
        code: 'custom',
        path: ['ALLOW_UNAUTHENTICATED_DEVICE_ACCESS'],
        message: 'Unauthenticated device access can only be enabled in development'
      });
    }
  });

export const env = envSchema.parse(process.env);
