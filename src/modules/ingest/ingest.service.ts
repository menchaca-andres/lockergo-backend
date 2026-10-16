import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { deriveEvents } from '../../services/eventEngine';
import { normalizeReadingValue } from '../../services/valueNormalizer';
import { publishLockerUpdate, type LockerUpdate } from '../lockers/locker-update-bus';
import type { IngestReadingsInput } from './ingest.schemas';
import { resolveRecordedAt } from './reading-timestamp';

export async function ingestReadings(
  deviceId: number,
  input: IngestReadingsInput
): Promise<{ accepted: number; rejected: Array<{ component: string; reason: string }> } | null> {
  const result = await prisma.$transaction(async (transaction) => {
    const device = await transaction.device.findFirst({
      where: {
        id_device: deviceId,
        code: input.deviceCode,
        isActive: true,
        locker: { isActive: true }
      },
      select: { id_device: true, lockerId: true }
    });
    if (!device) return null;

    let accepted = 0;
    const rejected: Array<{ component: string; reason: string }> = [];
    const updates: Array<{ lockerId: number; update: LockerUpdate }> = [];
    const previousByComponent = new Map<number, {
      valueNum: number | null;
      valueBool: boolean | null;
      valueText: string | null;
      payload: Prisma.JsonValue | null;
      quality: 'OK' | 'OUT_OF_RANGE' | 'ERROR';
    } | null>();

    for (const incoming of input.readings) {
      const component = await transaction.component.findFirst({
        where: {
          deviceId,
          key: incoming.component,
          isEnabled: true,
          model: { isActive: true }
        },
        select: {
          id_component: true,
          key: true,
          name: true,
          model: { select: { type: { select: { valueKind: true, eventRules: true } } } }
        }
      });
      if (!component) {
        rejected.push({ component: incoming.component, reason: 'Unknown or disabled component' });
        continue;
      }

      const normalized = normalizeReadingValue(
        component.model.type.valueKind,
        incoming.value,
        incoming.quality
      );
      if (!normalized) {
        rejected.push({
          component: incoming.component,
          reason: `Value does not match ${component.model.type.valueKind}`
        });
        continue;
      }

      const now = new Date();
      const recordedAt = resolveRecordedAt(incoming.ts, now);

      if (!previousByComponent.has(component.id_component)) {
        const previous = await transaction.reading.findFirst({
          where: { componentId: component.id_component },
          select: {
            valueNum: true,
            valueBool: true,
            valueText: true,
            payload: true,
            quality: true
          },
          orderBy: [
            { recordedAt: 'desc' },
            { receivedAt: 'desc' },
            { id_reading: 'desc' }
          ]
        });
        previousByComponent.set(component.id_component, previous);
      }
      const previous = previousByComponent.get(component.id_component) ?? null;
      const reading = await transaction.reading.create({
        data: {
          componentId: component.id_component,
          lockerId: device.lockerId,
          ...normalized,
          payload: normalized.payload === null
            ? component.model.type.valueKind === 'JSON' ? Prisma.JsonNull : Prisma.DbNull
            : normalized.payload,
          quality: incoming.quality,
          recordedAt
        },
        select: { id_reading: true, receivedAt: true }
      });
      previousByComponent.set(component.id_component, {
        valueNum: normalized.valueNum,
        valueBool: normalized.valueBool,
        valueText: normalized.valueText,
        payload: normalized.payload,
        quality: incoming.quality
      });

      const emittedEvents: LockerUpdate['events'] = [];
      for (const event of deriveEvents(
        component.model.type.eventRules,
        previous,
        normalized,
        incoming.quality
      )) {
        const createdEvent = await transaction.event.create({
          data: {
            lockerId: device.lockerId,
            componentId: component.id_component,
            readingId: reading.id_reading,
            type: event.type,
            severity: event.severity,
            detail: event.detail satisfies Prisma.InputJsonObject
          },
          select: { id_event: true, type: true, severity: true, detail: true, createdAt: true }
        });
        emittedEvents.push({
          id_event: createdEvent.id_event.toString(),
          type: createdEvent.type,
          severity: createdEvent.severity,
          detail: createdEvent.detail,
          createdAt: createdEvent.createdAt.toISOString()
        });
      }
      updates.push({
        lockerId: device.lockerId,
        update: {
          reading: {
            id_reading: reading.id_reading.toString(),
            componentId: component.id_component,
            valueNum: normalized.valueNum,
            valueBool: normalized.valueBool,
            valueText: normalized.valueText,
            payload: normalized.payload,
            quality: incoming.quality,
            recordedAt: recordedAt.toISOString(),
            receivedAt: reading.receivedAt.toISOString(),
            component: { key: component.key, name: component.name }
          },
          events: emittedEvents
        }
      });
      accepted += 1;
    }

    await transaction.device.update({
      where: { id_device: device.id_device },
      data: {
        lastSeenAt: new Date(),
        ...(input.firmware !== undefined ? { firmwareVersion: input.firmware } : {})
      }
    });

    return { accepted, rejected, updates };
  });

  if (!result) return null;
  for (const update of result.updates) publishLockerUpdate(update.lockerId, update.update);
  return { accepted: result.accepted, rejected: result.rejected };
}
