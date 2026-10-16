import type { Role } from '../../generated/prisma/client';

export interface LockerUpdate {
  reading: {
    id_reading: string;
    componentId: number;
    valueNum: number | null;
    valueBool: boolean | null;
    valueText: string | null;
    payload: unknown;
    quality: string;
    recordedAt: string;
    receivedAt: string;
    component: { key: string; name: string };
  };
  events: Array<{
    id_event: string;
    type: string;
    severity: string;
    detail: unknown;
    createdAt: string;
    packageAudience?: { clientId: number; depositorId: number };
  }>;
}

export function filterLockerUpdateForUser(
  update: LockerUpdate,
  user: { id_user: number; role: Role }
): LockerUpdate {
  return {
    ...update,
    events: update.events.flatMap((event) => {
      const { packageAudience, ...visibleEvent } = event;
      if (
        packageAudience &&
        user.role !== 'ADMIN' &&
        (user.role !== 'CLIENTE' || packageAudience.clientId !== user.id_user)
      ) {
        return [];
      }
      return [visibleEvent];
    })
  };
}

interface SequencedUpdate {
  id: number;
  lockerId: number;
  update: LockerUpdate;
}

const HISTORY_LIMIT = 1000;
let nextEventId = Date.now();
const history: SequencedUpdate[] = [];
const listeners = new Map<number, Set<(event: SequencedUpdate) => void>>();

export function publishLockerUpdate(lockerId: number, update: LockerUpdate): void {
  const event = { id: nextEventId++, lockerId, update };
  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();
  for (const listener of listeners.get(lockerId) ?? []) listener(event);
}

export function subscribeToLockerUpdates(
  lockerId: number,
  lastEventId?: number,
  listener?: (event: SequencedUpdate) => void
): {
  replay: SequencedUpdate[];
  historyGap: boolean;
  unsubscribe: () => void;
} {
  const subscriber = listener ?? (() => undefined);
  const current = listeners.get(lockerId) ?? new Set<(event: SequencedUpdate) => void>();
  current.add(subscriber);
  listeners.set(lockerId, current);

  const oldestId = history[0]?.id;
  const historyGap = lastEventId !== undefined &&
    (oldestId === undefined || lastEventId < oldestId - 1);
  const replay = lastEventId === undefined || historyGap
    ? []
    : history.filter((event) => event.lockerId === lockerId && event.id > lastEventId);

  return {
    replay,
    historyGap,
    unsubscribe: () => {
      current.delete(subscriber);
      if (current.size === 0) listeners.delete(lockerId);
    }
  };
}
