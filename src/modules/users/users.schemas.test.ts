import { describe, expect, test } from 'bun:test';
import {
  assignLockersSchema,
  createUserSchema,
  updateUserSchema
} from './users.schemas';

describe('user schemas', () => {
  test('normalizes user identity and defaults new accounts to CLIENTE', () => {
    expect(createUserSchema.parse({
      name: '  User One ',
      email: ' USER@Example.com ',
      password: 'a-secure-password'
    })).toEqual({
      name: 'User One',
      email: 'user@example.com',
      password: 'a-secure-password',
      role: 'CLIENTE'
    });
  });

  test('accepts the supported account roles', () => {
    const roles = ['ADMIN', 'CLIENTE', 'DEPOSITANTE'] as const;
    for (const role of roles) {
      expect(createUserSchema.parse({
        name: 'User One',
        email: 'user@example.com',
        password: 'a-secure-password',
        role
      }).role).toBe(role);
    }
  });

  test('rejects weak passwords and oversized bcrypt inputs', () => {
    expect(createUserSchema.safeParse({
      name: 'User',
      email: 'user@example.com',
      password: 'short'
    }).success).toBe(false);
    expect(createUserSchema.safeParse({
      name: 'User',
      email: 'user@example.com',
      password: 'é'.repeat(37)
    }).success).toBe(false);
  });

  test('requires a non-empty user patch', () => {
    expect(updateUserSchema.safeParse({}).success).toBe(false);
    expect(updateUserSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  test('rejects duplicate and invalid locker assignments', () => {
    expect(assignLockersSchema.safeParse({ lockerIds: [1, 1] }).success).toBe(false);
    expect(assignLockersSchema.safeParse({ lockerIds: [0] }).success).toBe(false);
    expect(assignLockersSchema.parse({ lockerIds: [] })).toEqual({ lockerIds: [] });
  });
});
