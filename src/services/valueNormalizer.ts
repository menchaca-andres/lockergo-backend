import type { ValueKind } from '../generated/prisma/client';
import type { IncomingReading } from '../modules/ingest/ingest.schemas';

export type NormalizedReadingValue =
  | { valueNum: number; valueBool: null; valueText: null; payload: null }
  | { valueNum: null; valueBool: boolean; valueText: null; payload: null }
  | { valueNum: null; valueBool: null; valueText: string; payload: null }
  | { valueNum: null; valueBool: null; valueText: null; payload: IncomingReading['value'] }
  | { valueNum: null; valueBool: null; valueText: null; payload: null };

export function normalizeReadingValue(
  valueKind: ValueKind,
  value: IncomingReading['value'],
  quality: IncomingReading['quality'] = 'OK'
): NormalizedReadingValue | null {
  if (quality === 'ERROR' && value === null) {
    return { valueNum: null, valueBool: null, valueText: null, payload: null };
  }

  switch (valueKind) {
    case 'NUMBER':
      return typeof value === 'number' && Number.isFinite(value)
        ? { valueNum: value, valueBool: null, valueText: null, payload: null }
        : null;
    case 'BOOLEAN':
      return typeof value === 'boolean'
        ? { valueNum: null, valueBool: value, valueText: null, payload: null }
        : null;
    case 'STRING':
      return typeof value === 'string'
        ? { valueNum: null, valueBool: null, valueText: value, payload: null }
        : null;
    case 'JSON':
      return { valueNum: null, valueBool: null, valueText: null, payload: value };
  }
}
