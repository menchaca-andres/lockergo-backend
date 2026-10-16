import { describe, expect, test } from 'bun:test';
import { envSchema } from './env';

const baseConfig = {
  DATABASE_URL: 'postgresql://localhost/lockergo',
  JWT_SECRET: 'development-access-secret',
  JWT_REFRESH_SECRET: 'development-refresh-secret'
};

describe('device authentication environment setting', () => {
  test('is disabled by default and can be enabled in development', () => {
    expect(envSchema.parse(baseConfig).ALLOW_UNAUTHENTICATED_DEVICE_ACCESS).toBe(false);
    expect(envSchema.parse({
      ...baseConfig,
      NODE_ENV: 'development',
      ALLOW_UNAUTHENTICATED_DEVICE_ACCESS: 'true'
    }).ALLOW_UNAUTHENTICATED_DEVICE_ACCESS).toBe(true);
  });

  test('rejects unauthenticated device access outside development', () => {
    expect(envSchema.safeParse({
      ...baseConfig,
      NODE_ENV: 'test',
      ALLOW_UNAUTHENTICATED_DEVICE_ACCESS: 'true'
    }).success).toBe(false);
    expect(envSchema.safeParse({
      ...baseConfig,
      NODE_ENV: 'production',
      ALLOW_UNAUTHENTICATED_DEVICE_ACCESS: 'true'
    }).success).toBe(false);
  });
});
