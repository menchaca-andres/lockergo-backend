import { describe, expect, test } from 'bun:test';
import { ingestReadingsSchema } from './ingest.schemas';

describe('ingestReadingsSchema', () => {
  test('accepts version one reading values and defaults quality', () => {
    expect(ingestReadingsSchema.parse({
      deviceCode: 'esp32-locker-01',
      readings: [{ component: 'door-1', value: false, ts: 1760000000 }]
    })).toEqual({
      deviceCode: 'esp32-locker-01',
      readings: [{ component: 'door-1', value: false, quality: 'OK', ts: 1760000000 }]
    });
  });

  test('rejects invalid device codes, empty batches and oversized batches', () => {
    expect(ingestReadingsSchema.safeParse({
      deviceCode: '../device',
      readings: [{ component: 'door-1', value: true }]
    }).success).toBe(false);
    expect(ingestReadingsSchema.safeParse({ deviceCode: 'esp32-1', readings: [] }).success).toBe(false);
    expect(ingestReadingsSchema.safeParse({
      deviceCode: 'esp32-1',
      readings: Array.from({ length: 501 }, () => ({ component: 'door-1', value: true }))
    }).success).toBe(false);
  });

  test('accepts null for an explicitly errored sensor reading', () => {
    expect(ingestReadingsSchema.parse({
      deviceCode: 'esp32-locker-01',
      readings: [{ component: 'distance-1', value: null, quality: 'ERROR' }]
    }).readings[0]).toMatchObject({ value: null, quality: 'ERROR' });
  });
});
