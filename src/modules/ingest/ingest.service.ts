import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import { deriveEvents } from '../../services/eventEngine';
import { normalizeReadingValue } from '../../services/valueNormalizer';
import { publishLockerUpdate, type LockerUpdate } from '../lockers/locker-update-bus';
import { applyPackageDoorClosedTransition, estimatePackageSize } from '../packages/packages.service';
import { publishPackageUpdate, type PackageLiveUpdate } from '../packages/package-update-bus';
import type { IngestReadingsInput } from './ingest.schemas';
import { resolveRecordedAt } from './reading-timestamp';

interface SensorState {
  valueNum: number | null;
  valueBool: boolean | null;
  quality: 'OK' | 'OUT_OF_RANGE' | 'ERROR';
  calibration: Prisma.JsonValue | null;
  recordedAt: Date;
}

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
    const packageUpdates: Array<{ userId: number; update: PackageLiveUpdate }> = [];
    const sensorStateByType = new Map<string, SensorState>();
    const sensorComponents = await transaction.component.findMany({
      where: {
        deviceId,
        isEnabled: true,
        model: { isActive: true, type: { code: { in: ['door_contact', 'proximity', 'distance'] } } }
      },
      select: {
        calibration: true,
        model: { select: { type: { select: { code: true } } } },
        readings: {
          take: 1,
          orderBy: [{ recordedAt: 'desc' }, { receivedAt: 'desc' }, { id_reading: 'desc' }],
          select: { valueNum: true, valueBool: true, quality: true, recordedAt: true }
        }
      }
    });
    for (const sensor of sensorComponents) {
      const latest = sensor.readings[0];
      const current = sensorStateByType.get(sensor.model.type.code);
      if (latest && (!current || latest.recordedAt > current.recordedAt)) {
        sensorStateByType.set(sensor.model.type.code, {
          valueNum: latest.valueNum,
          valueBool: latest.valueBool,
          quality: latest.quality,
          calibration: sensor.calibration,
          recordedAt: latest.recordedAt
        });
      }
    }
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
          calibration: true,
          model: {
            select: {
              type: { select: { code: true, valueKind: true, eventRules: true } }
            }
          }
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
      const typeCode = component.model.type.code;
      if (typeCode === 'door_contact' || typeCode === 'proximity' || typeCode === 'distance') {
        sensorStateByType.set(typeCode, {
          valueNum: normalized.valueNum,
          valueBool: normalized.valueBool,
          quality: incoming.quality,
          calibration: component.calibration,
          recordedAt
        });
      }

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
        if (
          typeCode === 'door_contact' &&
          event.type === 'DOOR_CLOSED' &&
          incoming.quality === 'OK'
        ) {
          const presence = sensorStateByType.get('proximity');
          if (presence?.quality === 'OK' && presence.valueBool !== null) {
            const distance = sensorStateByType.get('distance');
            const sizeEstimate = presence.valueBool && distance?.quality === 'OK'
              ? estimatePackageSize(distance.valueNum, distance.calibration)
              : null;
            const transition = await applyPackageDoorClosedTransition(transaction, {
              lockerId: device.lockerId,
              hasPackage: presence.valueBool,
              sizeEstimate
            });
            if (transition) {
              const packageEventType = presence.valueBool ? 'PACKAGE_DEPOSITED' : 'PACKAGE_PICKED_UP';
              const packageEvent = await transaction.event.create({
                data: {
                  lockerId: device.lockerId,
                  packageId: transition.id_package,
                  componentId: component.id_component,
                  readingId: reading.id_reading,
                  type: packageEventType,
                  severity: 'INFO',
                  detail: {
                    packageCode: transition.code,
                    status: transition.status,
                    estimatedSize: transition.estimatedSize,
                    depositedAt: transition.depositedAt?.toISOString() ?? null,
                    pickedUpAt: transition.pickedUpAt?.toISOString() ?? null,
                    estimatedHeightCm: sizeEstimate?.estimatedHeightCm ?? null,
                    measuredDistanceCm: distance?.valueNum ?? null
                  } satisfies Prisma.InputJsonObject
                },
                select: { id_event: true, type: true, severity: true, detail: true, createdAt: true }
              });
              emittedEvents.push({
                id_event: packageEvent.id_event.toString(),
                type: packageEvent.type,
                severity: packageEvent.severity,
                detail: packageEvent.detail,
                createdAt: packageEvent.createdAt.toISOString(),
                packageAudience: {
                  clientId: transition.clientId,
                  depositorId: transition.depositorId
                }
              });
              const packageUpdate: PackageLiveUpdate = {
                package: {
                  id_package: transition.id_package,
                  code: transition.code,
                  status: transition.status,
                  estimatedSize: transition.estimatedSize,
                  depositedAt: transition.depositedAt?.toISOString() ?? null,
                  pickedUpAt: transition.pickedUpAt?.toISOString() ?? null
                },
                event: {
                  type: packageEventType,
                  createdAt: packageEvent.createdAt.toISOString()
                }
              };
              packageUpdates.push({ userId: transition.clientId, update: packageUpdate });
              packageUpdates.push({ userId: transition.depositorId, update: packageUpdate });
            }
          }
        }
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

    return { accepted, rejected, updates, packageUpdates };
  });

  if (!result) return null;
  for (const update of result.updates) publishLockerUpdate(update.lockerId, update.update);
  for (const update of result.packageUpdates) {
    publishPackageUpdate(update.userId, update.update);
  }
  return { accepted: result.accepted, rejected: result.rejected };
}
