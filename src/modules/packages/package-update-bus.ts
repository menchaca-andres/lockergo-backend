export interface PackageLiveUpdate {
  package: {
    id_package: number;
    code: string;
    status: 'PENDING' | 'PICKED_UP';
    estimatedSize: 'S' | 'M' | 'L' | null;
    estimatedHeightCm: number | null;
    depositedAt: string | null;
    pickedUpAt: string | null;
  };
  event: {
    type: 'PACKAGE_DEPOSITED' | 'PACKAGE_PICKED_UP';
    createdAt: string;
  };
}

interface SequencedPackageUpdate {
  id: number;
  update: PackageLiveUpdate;
}

const HISTORY_LIMIT = 1000;
const nextIdByUser = new Map<number, number>();
const historyByUser = new Map<number, SequencedPackageUpdate[]>();
const listenersByUser = new Map<number, Set<(event: SequencedPackageUpdate) => void>>();

export function publishPackageUpdate(userId: number, update: PackageLiveUpdate): void {
  const id = nextIdByUser.get(userId) ?? 1;
  nextIdByUser.set(userId, id + 1);
  const event = { id, update };
  const history = historyByUser.get(userId) ?? [];
  history.push(event);
  if (history.length > HISTORY_LIMIT) history.shift();
  historyByUser.set(userId, history);
  for (const listener of listenersByUser.get(userId) ?? []) listener(event);
}

export function subscribeToPackageUpdates(
  userId: number,
  lastEventId?: number,
  listener?: (event: SequencedPackageUpdate) => void
): {
  replay: SequencedPackageUpdate[];
  historyGap: boolean;
  unsubscribe: () => void;
} {
  const subscriber = listener ?? (() => undefined);
  const current = listenersByUser.get(userId) ?? new Set<(event: SequencedPackageUpdate) => void>();
  current.add(subscriber);
  listenersByUser.set(userId, current);

  const history = historyByUser.get(userId) ?? [];
  const oldestId = history[0]?.id;
  const historyGap = lastEventId !== undefined &&
    (oldestId === undefined || lastEventId < oldestId - 1);
  const replay = lastEventId === undefined || historyGap
    ? []
    : history.filter((event) => event.id > lastEventId);

  return {
    replay,
    historyGap,
    unsubscribe: () => {
      current.delete(subscriber);
      if (current.size === 0) listenersByUser.delete(userId);
    }
  };
}
