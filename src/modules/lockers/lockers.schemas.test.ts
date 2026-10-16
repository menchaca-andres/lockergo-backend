import { describe, expect, test } from 'bun:test';
import {
  createLockerSchema,
  lockerEventsQuerySchema,
  lockerHistoryQuerySchema,
  lockerIdSchema,
  updateLockerSchema
} from './lockers.schemas';

describe('locker schemas', () => {
  test('accepts locker codes and normalizes optional location', () => {
    expect(createLockerSchema.parse({
      code: ' locker-01 ',
      name: ' Lobby ',
      location: ' First floor '
    })).toEqual({
      code: 'locker-01',
      name: 'Lobby',
      location: 'First floor'
    });
  });

  test('rejects invalid locker codes, empty patches and invalid IDs', () => {
    expect(createLockerSchema.safeParse({ code: 'bad code', name: 'Locker' }).success).toBe(false);
    expect(updateLockerSchema.safeParse({}).success).toBe(false);
    expect(lockerIdSchema.safeParse({ id: '0' }).success).toBe(false);
  });

  test('allows clearing a locker location', () => {
    expect(updateLockerSchema.parse({ location: null })).toEqual({ location: null });
  });

  test('validates bounded reading and event filters', () => {
    expect(lockerHistoryQuerySchema.parse({
      limit: '250',
      componentId: '3',
      type: 'distance',
      page: '2'
    })).toEqual({
      limit: 250,
      componentId: 3,
      type: 'distance',
      page: 2
    });
    expect(lockerEventsQuerySchema.parse({ severity: 'WARNING', limit: '25' })).toEqual({
      severity: 'WARNING',
      limit: 25
    });
    expect(lockerHistoryQuerySchema.safeParse({ limit: '501' }).success).toBe(false);
    expect(lockerEventsQuerySchema.safeParse({
      from: '2026-10-15T12:00:00Z',
      to: '2026-10-14T12:00:00Z'
    }).success).toBe(false);
  });
});
