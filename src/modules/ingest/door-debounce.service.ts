import { Prisma } from '../../generated/prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { deriveBooleanTransition } from '../../services/eventEngine';
import { publishLockerUpdate, type LockerUpdate } from '../lockers/locker-update-bus';

type Transaction = Prisma.TransactionClient;

interface DoorComponentState {
  id_component: number;
  key: string;
  name: string;
  stableBooleanValue: boolean | null;
  pendingBooleanValue: boolean | null;
  pendingBooleanAt: Date | null;
  pendingBooleanReadingId: bigint | null;
  device: { lockerId: number };
  model: { type: { eventRules: Prisma.JsonValue | null } };
}

async function createTransition(
  transaction: Transaction,
  component: DoorComponentState,
  readingId: bigint,
  from: boolean,
  to: boolean
) {
  const transition = deriveBooleanTransition(component.model.type.eventRules, from, to);
  if (!transition) return null;

  const event = await transaction.event.create({
    data: {
      lockerId: component.device.lockerId,
      componentId: component.id_component,
      readingId,
      type: transition.type,
      severity: transition.severity,
      detail: transition.detail satisfies Prisma.InputJsonObject
    },
    select: {
      id_event: true,
      type: true,
      severity: true,
      detail: true,
      createdAt: true
    }
  });
  const reading = await transaction.reading.findUniqueOrThrow({
    where: { id_reading: readingId },
    select: {
      id_reading: true,
      componentId: true,
      valueNum: true,
      valueBool: true,
      valueText: true,
      payload: true,
      quality: true,
      purpose: true,
      recordedAt: true,
      receivedAt: true
    }
  });

  return {
    lockerId: component.device.lockerId,
    update: {
      reading: {
        ...reading,
        id_reading: reading.id_reading.toString(),
        recordedAt: reading.recordedAt.toISOString(),
        receivedAt: reading.receivedAt.toISOString(),
        component: { key: component.key, name: component.name }
      },
      events: [{
        id_event: event.id_event.toString(),
        type: event.type,
        severity: event.severity,
        detail: event.detail,
        createdAt: event.createdAt.toISOString()
      }]
    } satisfies LockerUpdate
  };
}

export async function recordDoorCandidate(
  transaction: Transaction,
  component: DoorComponentState,
  readingId: bigint,
  value: boolean,
  previousValue: boolean | null,
  recordedAt: Date
) {
  const stableValue = component.stableBooleanValue ?? previousValue ?? value;
  if (component.stableBooleanValue === null) {
    await transaction.component.update({
      where: { id_component: component.id_component },
      data: { stableBooleanValue: stableValue }
    });
  }

  if (value === stableValue) {
    if (component.pendingBooleanAt !== null) {
      await transaction.component.update({
        where: { id_component: component.id_component },
        data: {
          pendingBooleanValue: null,
          pendingBooleanAt: null,
          pendingBooleanReadingId: null
        }
      });
    }
    return null;
  }

  const pendingMatches = component.pendingBooleanValue === value &&
    component.pendingBooleanAt !== null;
  if (
    pendingMatches &&
    recordedAt.getTime() - component.pendingBooleanAt!.getTime() >= env.DOOR_DEBOUNCE_MS
  ) {
    await transaction.component.update({
      where: { id_component: component.id_component },
      data: {
        stableBooleanValue: value,
        pendingBooleanValue: null,
        pendingBooleanAt: null,
        pendingBooleanReadingId: null
      }
    });
    return createTransition(
      transaction,
      component,
      readingId,
      stableValue,
      value
    );
  }

  if (!pendingMatches) {
    await transaction.component.update({
      where: { id_component: component.id_component },
      data: {
        pendingBooleanValue: value,
        pendingBooleanAt: recordedAt,
        pendingBooleanReadingId: readingId
      }
    });
  }
  return null;
}

export async function flushDueDoorTransitions(
  transaction: Transaction,
  cutoff: Date,
  deviceId?: number
) {
  const candidates = await transaction.component.findMany({
    where: {
      ...(deviceId !== undefined ? { deviceId } : {}),
      pendingBooleanValue: { not: null },
      pendingBooleanAt: { lte: new Date(cutoff.getTime() - env.DOOR_DEBOUNCE_MS) },
      model: { type: { code: 'door_contact' } }
    },
    select: {
      id_component: true,
      key: true,
      name: true,
      stableBooleanValue: true,
      pendingBooleanValue: true,
      pendingBooleanAt: true,
      pendingBooleanReadingId: true,
      device: { select: { lockerId: true } },
      model: { select: { type: { select: { eventRules: true } } } }
    }
  });
  const updates: Array<{ lockerId: number; update: LockerUpdate }> = [];

  for (const component of candidates) {
    if (
      component.pendingBooleanValue === null ||
      component.pendingBooleanAt === null ||
      component.pendingBooleanReadingId === null
    ) continue;

    const from = component.stableBooleanValue;
    const to = component.pendingBooleanValue;
    const promoted = await transaction.component.updateMany({
      where: {
        id_component: component.id_component,
        pendingBooleanValue: to,
        pendingBooleanAt: component.pendingBooleanAt
      },
      data: {
        stableBooleanValue: to,
        pendingBooleanValue: null,
        pendingBooleanAt: null,
        pendingBooleanReadingId: null
      }
    });
    if (promoted.count !== 1 || from === null || from === to) continue;

    const update = await createTransition(
      transaction,
      component,
      component.pendingBooleanReadingId,
      from,
      to
    );
    if (update) updates.push(update);
  }

  return updates;
}

export async function flushDueDoorTransitionsAndPublish(): Promise<void> {
  const updates = await prisma.$transaction((transaction) =>
    flushDueDoorTransitions(transaction, new Date())
  );
  for (const update of updates) publishLockerUpdate(update.lockerId, update.update);
}
