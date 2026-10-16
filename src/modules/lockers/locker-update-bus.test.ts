import { describe, expect, test } from 'bun:test';
import { publishLockerUpdate, subscribeToLockerUpdates, type LockerUpdate } from './locker-update-bus';

const update: LockerUpdate = {
  reading: {
    id_reading: '1',
    componentId: 1,
    valueNum: null,
    valueBool: true,
    valueText: null,
    payload: null,
    quality: 'OK',
    recordedAt: '2026-10-15T12:00:00.000Z',
    receivedAt: '2026-10-15T12:00:00.000Z',
    component: { key: 'door', name: 'Door' }
  },
  events: []
};

describe('locker update bus', () => {
  test('delivers updates only to subscribers of the locker', () => {
    const received: number[] = [];
    const subscription = subscribeToLockerUpdates(71, undefined, (event) => received.push(event.lockerId));
    publishLockerUpdate(72, update);
    publishLockerUpdate(71, update);
    subscription.unsubscribe();

    expect(received).toEqual([71]);
  });

  test('replays updates after the provided event cursor', () => {
    let cursor: number | undefined;
    const subscription = subscribeToLockerUpdates(73, undefined, (event) => {
      cursor = event.id;
    });
    publishLockerUpdate(73, update);
    expect(cursor).toBeDefined();
    subscription.unsubscribe();
    publishLockerUpdate(73, update);
    publishLockerUpdate(74, update);

    const replaySubscription = subscribeToLockerUpdates(73, cursor);
    expect(replaySubscription.replay).toHaveLength(1);
    expect(replaySubscription.replay[0]?.lockerId).toBe(73);
    replaySubscription.unsubscribe();

    const expiredCursor = subscribeToLockerUpdates(73, 0);
    expect(expiredCursor.historyGap).toBe(true);
    expiredCursor.unsubscribe();
  });
});
