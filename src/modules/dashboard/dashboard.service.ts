import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import type { Prisma } from '../../generated/prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOCKER_INTERNAL_HEIGHT_CM = 20;

function numberFromDetail(detail: Prisma.JsonValue, key: string): number | null {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const value = detail[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function getAdminDashboardOverview(timezone = 'UTC') {
  const now = new Date();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const activityFrom = new Date(now.getTime() - 30 * DAY_MS);
  const offlineBefore = new Date(now.getTime() - env.DEVICE_OFFLINE_SECONDS * 1000);
  const longOpenBefore = new Date(now.getTime() - env.DOOR_OPEN_ALERT_SECONDS * 1000);
  const sensorErrorFrom = new Date(now.getTime() - DAY_MS);

  const [
    devices,
    latestDoorEvents,
    openingsToday,
    pendingPackages,
    heatmap,
    ranking,
    sensorErrors,
    recentEvents,
    recentPackages,
    packageStatusCounts,
    packageMeasurementEvents
  ] = await Promise.all([
    prisma.device.findMany({
      where: { isActive: true },
      select: {
        id_device: true,
        code: true,
        lockerId: true,
        lastSeenAt: true,
        locker: { select: { code: true, name: true } }
      }
    }),
    prisma.$queryRaw<Array<{
      id_event: bigint;
      lockerId: number;
      type: string;
      createdAt: Date;
      lockerCode: string;
      lockerName: string;
    }>>`
      SELECT DISTINCT ON (e."lockerId")
        e."id_event", e."lockerId", e."type", e."createdAt",
        l."code" AS "lockerCode", l."name" AS "lockerName"
      FROM "Event" e
      JOIN "Locker" l ON l."id_locker" = e."lockerId"
      WHERE e."type" IN ('DOOR_OPENED', 'DOOR_CLOSED')
      ORDER BY e."lockerId", e."createdAt" DESC, e."id_event" DESC
    `,
    prisma.event.count({ where: { type: 'DOOR_OPENED', createdAt: { gte: today, lte: now } } }),
    prisma.package.count({
      where: { status: 'PENDING', depositedAt: { not: null } }
    }),
    prisma.$queryRaw<Array<{ dayOfWeek: number; hour: number; count: number }>>`
      SELECT EXTRACT(DOW FROM (
          e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
        ))::int AS "dayOfWeek",
        EXTRACT(HOUR FROM (
          e."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}
        ))::int AS hour,
        COUNT(*)::int AS count
      FROM "Event" e
      WHERE e."type" = 'DOOR_OPENED'
        AND e."createdAt" >= ${activityFrom}
        AND e."createdAt" <= ${now}
      GROUP BY "dayOfWeek", hour
      ORDER BY "dayOfWeek", hour
    `,
    prisma.$queryRaw<Array<{ lockerId: number; lockerCode: string; lockerName: string; count: number }>>`
      SELECT e."lockerId", l."code" AS "lockerCode", l."name" AS "lockerName",
        COUNT(*)::int AS count
      FROM "Event" e
      JOIN "Locker" l ON l."id_locker" = e."lockerId"
      WHERE e."type" = 'DOOR_OPENED'
        AND e."createdAt" >= ${activityFrom}
        AND e."createdAt" <= ${now}
      GROUP BY e."lockerId", l."code", l."name"
      ORDER BY count DESC, l."code" ASC
      LIMIT 10
    `,
    prisma.event.findMany({
      where: {
        type: { in: ['SENSOR_ERROR', 'SENSOR_OUT_OF_RANGE'] },
        createdAt: { gte: sensorErrorFrom }
      },
      orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
      take: 10,
      select: {
        id_event: true,
        type: true,
        severity: true,
        detail: true,
        createdAt: true,
        locker: { select: { id_locker: true, code: true, name: true } },
        component: { select: { key: true, name: true } }
      }
    }),
    prisma.event.findMany({
      orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
      take: 15,
      select: {
        id_event: true,
        type: true,
        severity: true,
        detail: true,
        createdAt: true,
        locker: { select: { id_locker: true, code: true, name: true } },
        component: { select: { key: true, name: true } },
        package: { select: { id_package: true, code: true, status: true } }
      }
    }),
    prisma.package.findMany({
      orderBy: [{ createdAt: 'desc' }, { id_package: 'desc' }],
      take: 10,
      select: {
        id_package: true,
        code: true,
        status: true,
        estimatedSize: true,
        events: {
          where: { type: 'PACKAGE_DEPOSITED' },
          orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
          take: 1,
          select: { detail: true }
        },
        createdAt: true,
        depositedAt: true,
        pickedUpAt: true,
        locker: { select: { id_locker: true, code: true, name: true } },
        client: { select: { id_user: true, name: true } },
        depositor: { select: { id_user: true, name: true } }
      }
    }),
    prisma.package.groupBy({
      by: ['status'],
      _count: { _all: true },
      orderBy: { status: 'asc' }
    }),
    prisma.event.findMany({
      where: {
        type: 'PACKAGE_DEPOSITED',
        packageId: { not: null },
        createdAt: { gte: activityFrom, lte: now }
      },
      orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
      select: {
        detail: true,
        createdAt: true,
        reading: { select: { valueNum: true } },
        package: { select: { code: true } },
        locker: { select: { code: true } }
      }
    })
  ]);

  const onlineLockerIds = new Set(
    devices
      .filter((device) => device.lastSeenAt && device.lastSeenAt >= offlineBefore)
      .map((device) => device.lockerId)
  );
  const activeLockerIds = new Set(devices.map((device) => device.lockerId));
  const openDoorEvents = latestDoorEvents.filter(
    (event) => event.type === 'DOOR_OPENED' && onlineLockerIds.has(event.lockerId)
  );
  const alerts = [
    ...devices
      .filter((device) => !device.lastSeenAt || device.lastSeenAt < offlineBefore)
      .map((device) => ({
        type: 'DEVICE_OFFLINE',
        severity: 'CRITICAL',
        deviceCode: device.code,
        locker: device.locker,
        occurredAt: device.lastSeenAt?.toISOString() ?? null
      })),
    ...openDoorEvents
      .filter((event) => event.createdAt <= longOpenBefore)
      .map((event) => ({
        type: 'DOOR_OPEN_TOO_LONG',
        severity: 'WARNING',
        locker: { id_locker: event.lockerId, code: event.lockerCode, name: event.lockerName },
        occurredAt: event.createdAt.toISOString(),
        durationSeconds: Math.floor((now.getTime() - event.createdAt.getTime()) / 1000)
      })),
    ...sensorErrors.map((event) => ({
      type: event.type,
      severity: event.severity,
      locker: event.locker,
      component: event.component,
      detail: event.detail,
      occurredAt: event.createdAt.toISOString()
    }))
  ];

  return {
    generatedAt: now.toISOString(),
    activityRange: {
      from: activityFrom.toISOString(),
      to: now.toISOString(),
      timezone
    },
    kpis: {
      lockersOnline: onlineLockerIds.size,
      lockersWithActiveDevices: activeLockerIds.size,
      doorsOpenNow: openDoorEvents.length,
      pendingPackages,
      doorOpeningsToday: openingsToday
    },
    activityHeatmap: heatmap,
    lockerRanking: ranking,
    packagesByStatus: packageStatusCounts.map(({ status, _count }) => ({
      status,
      count: _count._all
    })),
    packageMeasurements: packageMeasurementEvents.flatMap((event) => {
      const estimatedHeightCm = numberFromDetail(event.detail, 'estimatedHeightCm');
      if (
        estimatedHeightCm === null ||
        estimatedHeightCm < 0 ||
        estimatedHeightCm > LOCKER_INTERNAL_HEIGHT_CM ||
        event.package === null
      ) return [];
      return [{
        packageCode: event.package.code,
        lockerCode: event.locker.code,
        estimatedHeightCm,
        recordedAt: event.createdAt.toISOString()
      }];
    }),
    alerts,
    recentEvents: recentEvents.map((event) => ({ ...event, id_event: event.id_event.toString() })),
    recentPackages: recentPackages.map(({ events, ...packageRecord }) => ({
      ...packageRecord,
      estimatedHeightCm: events[0] ? numberFromDetail(events[0].detail, 'estimatedHeightCm') : null
    }))
  };
}
