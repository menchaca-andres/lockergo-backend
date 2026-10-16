import { describe, expect, test } from 'bun:test';
import {
  createComponentSchema,
  createDeviceSchema,
  deviceCodeSchema,
  updateComponentSchema
} from './devices.schemas';

describe('device and component schemas', () => {
  test('validates and defaults device configuration', () => {
    expect(createDeviceSchema.parse({ code: 'esp32-locker-01', lockerId: 3 })).toEqual({
      code: 'esp32-locker-01',
      lockerId: 3,
      boardModel: 'ESP32-38pin'
    });
    expect(deviceCodeSchema.safeParse({ code: '../other' }).success).toBe(false);
  });

  test('validates component config as a JSON object', () => {
    expect(createComponentSchema.safeParse({
      modelId: 2,
      key: 'door-1',
      name: 'Door contact',
      config: { pin: 33, intervalMs: 1000, options: { pull: 'up' } }
    }).success).toBe(true);
    expect(createComponentSchema.safeParse({
      modelId: 2,
      key: 'door-1',
      name: 'Door contact',
      config: []
    }).success).toBe(false);
  });

  test('requires a non-empty component patch', () => {
    expect(updateComponentSchema.safeParse({}).success).toBe(false);
    expect(updateComponentSchema.safeParse({ modelId: 4 }).success).toBe(true);
  });
});
