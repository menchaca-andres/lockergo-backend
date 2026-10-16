import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import type { PublicUser } from '../auth/auth.service';
import { getLocker, listLockers } from './lockers.service';

export async function listLockerOverview(user: PublicUser) {
  const lockers = await listLockers(user);
  if (lockers.length === 0) return [];

  const devices = await prisma.device.findMany({
    where: { lockerId: { in: lockers.map(({ id_locker }) => id_locker) } },
    select: { lockerId: true, isActive: true, lastSeenAt: true }
  });
  const byLocker = new Map<number, typeof devices>();
  for (const device of devices) {
    const lockerDevices = byLocker.get(device.lockerId) ?? [];
    lockerDevices.push(device);
    byLocker.set(device.lockerId, lockerDevices);
  }

  const now = Date.now();
  return lockers.map((locker) => {
    const lockerDevices = byLocker.get(locker.id_locker) ?? [];
    const onlineDeviceCount = lockerDevices.filter((device) =>
      device.isActive &&
      device.lastSeenAt !== null &&
      now - device.lastSeenAt.getTime() <= env.DEVICE_OFFLINE_SECONDS * 1000
    ).length;
    const lastSeenAt = lockerDevices.reduce<Date | null>((latest, device) =>
      device.lastSeenAt && (!latest || device.lastSeenAt > latest) ? device.lastSeenAt : latest, null);
    return {
      ...locker,
      deviceCount: lockerDevices.length,
      onlineDeviceCount,
      lastSeenAt,
      deviceStatus: lockerDevices.length === 0
        ? 'NO_DEVICE'
        : onlineDeviceCount > 0
          ? 'ONLINE'
          : lockerDevices.some((device) => device.isActive)
            ? 'OFFLINE'
            : 'INACTIVE'
    };
  });
}

const readingSelect = {
  id_reading: true,
  componentId: true,
  valueNum: true,
  valueBool: true,
  valueText: true,
  payload: true,
  quality: true,
  recordedAt: true,
  receivedAt: true,
  component: {
    select: {
      key: true,
      name: true,
      model: { select: { type: { select: { name: true, unit: true, valueKind: true } } } }
    }
  }
} as const;

export async function getLockerState(user: PublicUser, lockerId: number) {
  const locker = await getLocker(user, lockerId);
  if (!locker) return null;

  const devices = await prisma.device.findMany({
    where: { lockerId },
    orderBy: { id_device: 'asc' },
    select: {
      id_device: true,
      code: true,
      boardModel: true,
      firmwareVersion: true,
      lastSeenAt: true,
      isActive: true,
      components: {
        orderBy: { id_component: 'asc' },
        select: {
          id_component: true,
          key: true,
          name: true,
          isEnabled: true,
          model: {
            select: {
              name: true,
              type: { select: { name: true, unit: true, valueKind: true } }
            }
          },
          readings: {
            where: { lockerId },
            orderBy: [
              { recordedAt: 'desc' },
              { receivedAt: 'desc' },
              { id_reading: 'desc' }
            ],
            take: 1,
            select: {
              id_reading: true,
              valueNum: true,
              valueBool: true,
              valueText: true,
              payload: true,
              quality: true,
              recordedAt: true,
              receivedAt: true
            }
          }
        }
      }
    }
  });
  const now = Date.now();

  return {
    locker,
    devices: devices.map(({ lastSeenAt, isActive, components, ...device }) => ({
      ...device,
      lastSeenAt,
      isActive,
      connectionStatus: !isActive
        ? 'INACTIVE'
        : lastSeenAt && now - lastSeenAt.getTime() <= env.DEVICE_OFFLINE_SECONDS * 1000
          ? 'ONLINE'
          : 'OFFLINE',
      components: components.map(({ readings, ...component }) => ({
        ...component,
        latestReading: readings[0]
          ? { ...readings[0], id_reading: readings[0].id_reading.toString() }
          : null
      }))
    }))
  };
}

export async function listLockerReadings(
  user: PublicUser,
  lockerId: number,
  filters: {
    from?: Date;
    to?: Date;
    componentId?: number;
    limit: number;
  }
) {
  if (!(await getLocker(user, lockerId))) return null;

  const readings = await prisma.reading.findMany({
    where: {
      lockerId,
      ...(filters.componentId !== undefined ? { componentId: filters.componentId } : {}),
      ...(filters.from || filters.to
        ? {
            recordedAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {})
            }
          }
        : {})
    },
    orderBy: [
      { recordedAt: 'desc' },
      { receivedAt: 'desc' },
      { id_reading: 'desc' }
    ],
    take: filters.limit,
    select: readingSelect
  });

  return readings.map((reading) => ({ ...reading, id_reading: reading.id_reading.toString() }));
}

export async function listLockerEvents(
  user: PublicUser,
  lockerId: number,
  filters: {
    from?: Date;
    to?: Date;
    type?: string;
    severity?: 'INFO' | 'WARNING' | 'CRITICAL';
    limit: number;
  }
) {
  if (!(await getLocker(user, lockerId))) return null;

  const events = await prisma.event.findMany({
    where: {
      lockerId,
      ...(user.role === 'CLIENTE'
        ? { OR: [{ packageId: null }, { package: { clientId: user.id_user } }] }
        : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.severity ? { severity: filters.severity } : {}),
      ...(filters.from || filters.to
        ? {
            createdAt: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {})
            }
          }
        : {})
    },
    orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
    take: filters.limit,
    select: {
      id_event: true,
      type: true,
      severity: true,
      detail: true,
      createdAt: true,
      acknowledgedAt: true,
      component: { select: { key: true, name: true } },
      reading: { select: { id_reading: true, recordedAt: true } },
      package: { select: { id_package: true, code: true, status: true } }
    }
  });

  return events.map((event) => ({
    ...event,
    id_event: event.id_event.toString(),
    reading: event.reading
      ? { ...event.reading, id_reading: event.reading.id_reading.toString() }
      : null
  }));
}
