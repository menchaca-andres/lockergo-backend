import { describe, expect, test } from 'bun:test';
import { deriveEvents } from './eventEngine';

const booleanValue = (valueBool: boolean) => ({
  valueNum: null,
  valueBool,
  valueText: null,
  payload: null
});

describe('deriveEvents', () => {
  test('derives configured door state transitions', () => {
    expect(deriveEvents(
      { onChange: { 'true->false': 'DOOR_OPENED' } },
      { valueNum: null, valueBool: true, valueText: null, payload: null, quality: 'OK' },
      booleanValue(false),
      'OK'
    )).toEqual([{
      type: 'DOOR_OPENED',
      severity: 'INFO',
      detail: { previousValue: true, value: false }
    }]);
  });

  test('raises sensor quality events only on state changes', () => {
    expect(deriveEvents(null, null, booleanValue(false), 'ERROR')[0]?.type).toBe('SENSOR_ERROR');
    expect(deriveEvents(null, {
      valueNum: 1, valueBool: null, valueText: null, payload: null, quality: 'ERROR'
    }, booleanValue(false), 'ERROR')).toEqual([]);
    expect(deriveEvents(null, {
      valueNum: 1, valueBool: null, valueText: null, payload: null, quality: 'ERROR'
    }, booleanValue(false), 'OK')[0]?.type).toBe('SENSOR_RECOVERED');
  });

  test('ignores malformed event rules', () => {
    expect(deriveEvents(
      { onChange: { 'true->false': 'not an event type' } },
      { valueNum: null, valueBool: true, valueText: null, payload: null, quality: 'OK' },
      booleanValue(false),
      'OK'
    )).toEqual([]);
  });
});
