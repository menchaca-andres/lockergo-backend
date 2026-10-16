import type { Quality, Severity } from '../generated/prisma/client';
import type { NormalizedReadingValue } from './valueNormalizer';

export interface PreviousReadingState {
  valueNum: number | null;
  valueBool: boolean | null;
  valueText: string | null;
  payload: unknown;
  quality: Quality;
}

export interface DerivedEvent {
  type: string;
  severity: Severity;
  detail: Record<string, string | number | boolean | null>;
}

function currentValue(value: NormalizedReadingValue): string | number | boolean | null {
  if (value.valueNum !== null) return value.valueNum;
  if (value.valueBool !== null) return value.valueBool;
  if (value.valueText !== null) return value.valueText;
  return value.payload === null ? null : JSON.stringify(value.payload);
}

function previousValue(previous: PreviousReadingState): string | number | boolean | null {
  if (previous.valueNum !== null) return previous.valueNum;
  if (previous.valueBool !== null) return previous.valueBool;
  if (previous.valueText !== null) return previous.valueText;
  return previous.payload === null ? null : JSON.stringify(previous.payload);
}

function transitionType(eventRules: unknown, from: boolean, to: boolean): string | null {
  if (!eventRules || typeof eventRules !== 'object' || Array.isArray(eventRules)) return null;
  const rules = (eventRules as Record<string, unknown>)['onChange'];
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) return null;

  const transitions = rules as Record<string, unknown>;
  const event = transitions[`${from}->${to}`] ?? transitions[`${from}→${to}`];
  return typeof event === 'string' && /^[A-Z][A-Z0-9_]{1,79}$/.test(event) ? event : null;
}

export function deriveEvents(
  eventRules: unknown,
  previous: PreviousReadingState | null,
  value: NormalizedReadingValue,
  quality: Quality
): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const current = currentValue(value);

  if (previous && typeof current === 'boolean' && typeof previous.valueBool === 'boolean') {
    const type = transitionType(eventRules, previous.valueBool, current);
    if (type) {
      events.push({
        type,
        severity: 'INFO',
        detail: { previousValue: previous.valueBool, value: current }
      });
    }
  }

  if (quality !== 'OK' && previous?.quality !== quality) {
    events.push({
      type: quality === 'ERROR' ? 'SENSOR_ERROR' : 'SENSOR_OUT_OF_RANGE',
      severity: quality === 'ERROR' ? 'CRITICAL' : 'WARNING',
      detail: { quality, value: current }
    });
  } else if (quality === 'OK' && previous && previous.quality !== 'OK') {
    events.push({
      type: 'SENSOR_RECOVERED',
      severity: 'INFO',
      detail: { previousQuality: previous.quality, quality, value: current }
    });
  }

  return events;
}
