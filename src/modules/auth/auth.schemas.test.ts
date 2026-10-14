import { describe, expect, test } from 'bun:test';
import { loginSchema } from './auth.schemas';

describe('loginSchema', () => {
  test('normalizes email addresses', () => {
    expect(loginSchema.parse({ email: '  ADMIN@Example.com ', password: 'valid-pass' })).toEqual({
      email: 'admin@example.com',
      password: 'valid-pass'
    });
  });

  test('rejects invalid emails, empty passwords and bcrypt inputs over 72 bytes', () => {
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'pass' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'admin@example.com', password: '' }).success).toBe(false);
    expect(
      loginSchema.safeParse({ email: 'admin@example.com', password: 'a'.repeat(73) }).success
    ).toBe(false);
  });
});
