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

export interface SensorErrorState {
  consecutiveErrors: number;
  threshold: number;
  active: boolean;
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

export function deriveBooleanTransition(
  eventRules: unknown,
  from: boolean,
  to: boolean
): DerivedEvent | null {
  const type = transitionType(eventRules, from, to);
  return type
    ? { type, severity: 'INFO', detail: { previousValue: from, value: to } }
    : null;
}

export function deriveEvents(
  eventRules: unknown,
  previous: PreviousReadingState | null,
  value: NormalizedReadingValue,
  quality: Quality,
  errorState: SensorErrorState = { consecutiveErrors: 0, threshold: 3, active: false }
): DerivedEvent[] {
  const events: DerivedEvent[] = [];
  const current = currentValue(value);

  if (previous && typeof current === 'boolean' && typeof previous.valueBool === 'boolean') {
    const transition = deriveBooleanTransition(eventRules, previous.valueBool, current);
    if (transition) events.push(transition);
  }

  if (
    quality === 'ERROR' &&
    errorState.consecutiveErrors >= errorState.threshold &&
    !errorState.active
  ) {
    events.push({
      type: 'SENSOR_ERROR',
      severity: 'WARNING',
      detail: { quality, value: current, consecutiveErrors: errorState.consecutiveErrors }
    });
  } else if (quality === 'OUT_OF_RANGE' && previous?.quality !== 'OUT_OF_RANGE') {
    events.push({
      type: 'SENSOR_OUT_OF_RANGE',
      severity: 'WARNING',
      detail: { quality, value: current }
    });
  } else if (
    quality === 'OK' &&
    (errorState.active || previous?.quality === 'OUT_OF_RANGE')
  ) {
    events.push({
      type: 'SENSOR_RECOVERED',
      severity: 'INFO',
      detail: { previousQuality: previous?.quality ?? 'ERROR', quality, value: current }
    });
  }

  return events;
}
