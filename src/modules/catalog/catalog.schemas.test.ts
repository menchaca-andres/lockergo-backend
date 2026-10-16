import { describe, expect, test } from 'bun:test';
import {
  createComponentModelSchema,
  createComponentTypeSchema,
  updateComponentModelSchema
} from './catalog.schemas';

describe('catalog schemas', () => {
  test('validates component types and optional event rules', () => {
    expect(createComponentTypeSchema.parse({
      code: 'door_contact',
      name: 'Door contact',
      category: 'SENSOR',
      valueKind: 'BOOLEAN',
      eventRules: { onChange: { 'true->false': 'DOOR_OPENED' } }
    }).code).toBe('door_contact');
    expect(createComponentTypeSchema.safeParse({
      code: 'invalid code',
      name: 'Distance',
      category: 'SENSOR',
      valueKind: 'NUMBER'
    }).success).toBe(false);
  });

  test('validates model driver and requires at least one update field', () => {
    expect(createComponentModelSchema.safeParse({
      typeId: 1,
      code: 'hc-sr04',
      name: 'HC-SR04',
      driver: 'hcsr04',
      defaultConfig: { triggerPin: 25, echoPin: 26 }
    }).success).toBe(true);
    expect(updateComponentModelSchema.safeParse({}).success).toBe(false);
  });
});
