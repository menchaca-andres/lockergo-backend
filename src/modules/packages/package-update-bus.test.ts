import { describe, expect, test } from 'bun:test';
import { publishPackageUpdate, subscribeToPackageUpdates } from './package-update-bus';

const update = {
  package: {
    id_package: 31,
    code: 'pkg-31',
    status: 'PENDING' as const,
    estimatedSize: 'M' as const,
    estimatedHeightCm: 10,
    depositedAt: '2026-10-15T12:00:00.000Z',
    pickedUpAt: null
  },
  event: {
    type: 'PACKAGE_DEPOSITED' as const,
    createdAt: '2026-10-15T12:00:00.000Z'
  }
};

describe('package update bus', () => {
  test('delivers updates only to the matching user', () => {
    const received: number[] = [];
    const subscription = subscribeToPackageUpdates(101, undefined, (event) => {
      received.push(event.update.package.id_package);
    });

    publishPackageUpdate(102, update);
    publishPackageUpdate(101, update);
    subscription.unsubscribe();

    expect(received).toEqual([31]);
  });

  test('replays per-user updates after the provided cursor', () => {
    let cursor: number | undefined;
    const first = subscribeToPackageUpdates(103, undefined, (event) => {
      cursor = event.id;
    });
    publishPackageUpdate(103, update);
    first.unsubscribe();
    publishPackageUpdate(103, update);
    publishPackageUpdate(104, update);

    const replay = subscribeToPackageUpdates(103, cursor);
    expect(replay.replay).toHaveLength(1);
    expect(replay.replay[0]?.update.package.code).toBe('pkg-31');
    expect(replay.historyGap).toBe(false);
    replay.unsubscribe();
  });
});
