import { describe, expect, test } from 'bun:test';
import { resolveRecordedAt } from './reading-timestamp';

describe('resolveRecordedAt', () => {
  const now = new Date('2026-10-14T20:00:00.000Z');

  test('uses server time when the device timestamp is omitted or too far away', () => {
    expect(resolveRecordedAt(undefined, now)).toBe(now);
    expect(resolveRecordedAt(Date.parse('2026-10-14T20:10:00Z') / 1000, now)).toBe(now);
    expect(resolveRecordedAt(Date.parse('2026-10-14T19:50:00Z') / 1000, now)).toBe(now);
  });

  test('preserves a device timestamp within the five-minute clock-skew window', () => {
    const deviceTime = Date.parse('2026-10-14T20:04:59Z') / 1000;
    expect(resolveRecordedAt(deviceTime, now)).toEqual(new Date(deviceTime * 1000));
  });

  test('falls back to server time for a timestamp outside the Date range', () => {
    expect(resolveRecordedAt(Number.MAX_VALUE, now)).toBe(now);
  });
});
