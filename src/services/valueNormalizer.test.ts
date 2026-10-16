import { describe, expect, test } from 'bun:test';
import { normalizeReadingValue } from './valueNormalizer';

describe('normalizeReadingValue', () => {
  test('stores values in the column matching the declared kind', () => {
    expect(normalizeReadingValue('NUMBER', 12.5)).toEqual({
      valueNum: 12.5, valueBool: null, valueText: null, payload: null
    });
    expect(normalizeReadingValue('BOOLEAN', false)).toEqual({
      valueNum: null, valueBool: false, valueText: null, payload: null
    });
    expect(normalizeReadingValue('STRING', 'open')).toEqual({
      valueNum: null, valueBool: null, valueText: 'open', payload: null
    });
  });

  test('rejects mismatched values and retains generic JSON payloads', () => {
    expect(normalizeReadingValue('NUMBER', '12.5')).toBeNull();
    expect(normalizeReadingValue('BOOLEAN', 1)).toBeNull();
    expect(normalizeReadingValue('JSON', { distance: 12.5 })).toEqual({
      valueNum: null,
      valueBool: null,
      valueText: null,
      payload: { distance: 12.5 }
    });
  });

  test('accepts a null reading only when it represents a sensor error', () => {
    expect(normalizeReadingValue('NUMBER', null, 'ERROR')).toEqual({
      valueNum: null,
      valueBool: null,
      valueText: null,
      payload: null
    });
    expect(normalizeReadingValue('NUMBER', null, 'OK')).toBeNull();
    expect(normalizeReadingValue('NUMBER', null, 'OUT_OF_RANGE')).toBeNull();
  });
});
