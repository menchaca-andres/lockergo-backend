import { prisma } from '../../lib/prisma';

interface AnalyticsRange {
  from?: Date;
  to?: Date;
}

function rangeFrom(filters: AnalyticsRange) {
  const to = filters.to ?? new Date();
  const from = filters.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export async function getLockerAnalytics(lockerId: number, filters: AnalyticsRange) {
  const locker = await prisma.locker.findUnique({
    where: { id_locker: lockerId },
    select: { id_locker: true, code: true, name: true, location: true }
  });
  if (!locker) return null;
  const { from, to } = rangeFrom(filters);

  const [doorByDay, activityHeatmap, infraredWithDoorClosed, sizeDistribution, distanceSensors] =
    await Promise.all([
      prisma.$queryRaw<Array<{ day: Date; type: string; count: number }>>`
        SELECT DATE_TRUNC('day', e."createdAt") AS day, e."type", COUNT(*)::int AS count
        FROM "Event" e
        WHERE e."lockerId" = ${lockerId}
          AND e."type" IN ('DOOR_OPENED', 'DOOR_CLOSED')
          AND e."createdAt" >= ${from}
          AND e."createdAt" <= ${to}
        GROUP BY DATE_TRUNC('day', e."createdAt"), e."type"
        ORDER BY day ASC
      `,
      prisma.$queryRaw<Array<{ dayOfWeek: number; hour: number; count: number }>>`
        SELECT EXTRACT(DOW FROM e."createdAt")::int AS "dayOfWeek",
          EXTRACT(HOUR FROM e."createdAt")::int AS hour,
          COUNT(*)::int AS count
        FROM "Event" e
        WHERE e."lockerId" = ${lockerId}
          AND e."type" = 'DOOR_OPENED'
          AND e."createdAt" >= ${from}
          AND e."createdAt" <= ${to}
        GROUP BY "dayOfWeek", hour
        ORDER BY "dayOfWeek", hour
      `,
      prisma.$queryRaw<Array<{ count: number }>>`
        SELECT COUNT(*)::int AS count
        FROM "Event" packet_event
        WHERE packet_event."lockerId" = ${lockerId}
          AND packet_event."type" = 'PACKET_DETECTED'
          AND packet_event."createdAt" >= ${from}
          AND packet_event."createdAt" <= ${to}
          AND (
            SELECT door_event."type"
            FROM "Event" door_event
            WHERE door_event."lockerId" = packet_event."lockerId"
              AND door_event."type" IN ('DOOR_OPENED', 'DOOR_CLOSED')
              AND door_event."createdAt" <= packet_event."createdAt"
            ORDER BY door_event."createdAt" DESC, door_event."id_event" DESC
            LIMIT 1
          ) = 'DOOR_CLOSED'
      `,
      prisma.package.groupBy({
        by: ['estimatedSize'],
        where: {
          lockerId,
          depositedAt: { gte: from, lte: to },
          estimatedSize: { not: null }
        },
        _count: { _all: true },
        orderBy: { estimatedSize: 'asc' }
      }),
      prisma.component.findMany({
        where: {
          device: { lockerId },
          isEnabled: true,
          model: { type: { code: 'distance' } }
        },
        select: {
          id_component: true,
          key: true,
          name: true,
          calibration: true,
          model: { select: { type: { select: { unit: true } } } },
          readings: {
            where: { lockerId },
            orderBy: [{ recordedAt: 'desc' }, { receivedAt: 'desc' }, { id_reading: 'desc' }],
            take: 1,
            select: { valueNum: true, quality: true, recordedAt: true }
          }
        },
        orderBy: { id_component: 'asc' }
      })
    ]);
  const doorByDaySummary = new Map<string, { day: string; opened: number; closed: number }>();
  for (const { day, type, count } of doorByDay) {
    const key = day.toISOString().slice(0, 10);
    const summary = doorByDaySummary.get(key) ?? { day: key, opened: 0, closed: 0 };
    if (type === 'DOOR_OPENED') summary.opened = count;
    else summary.closed = count;
    doorByDaySummary.set(key, summary);
  }

  return {
    locker,
    range: { from: from.toISOString(), to: to.toISOString(), timezone: 'UTC' },
    doorByDay: [...doorByDaySummary.values()],
    activityHeatmap,
    infraredDetectionsWithDoorClosed: infraredWithDoorClosed[0]?.count ?? 0,
    packageSizeDistribution: sizeDistribution.map(({ estimatedSize, _count }) => ({
      size: estimatedSize,
      count: _count._all
    })),
    liveDistance: distanceSensors.map((component) => {
      const reading = component.readings[0];
      const calibration = component.calibration;
      const emptyDistanceCm =
        calibration !== null &&
        typeof calibration === 'object' &&
        !Array.isArray(calibration) &&
        typeof calibration['emptyDistanceCm'] === 'number'
          ? calibration['emptyDistanceCm']
          : 20;
      return {
        componentId: component.id_component,
        key: component.key,
        name: component.name,
        unit: component.model.type.unit,
        measuredDistanceCm: reading?.valueNum ?? null,
        quality: reading?.quality ?? null,
        recordedAt: reading?.recordedAt.toISOString() ?? null,
        emptyDistanceCm,
        estimatedHeightCm: reading?.valueNum === null || reading?.valueNum === undefined
          ? null
          : reading.valueNum < 0 ||
              emptyDistanceCm - reading.valueNum < 0 ||
              emptyDistanceCm - reading.valueNum > 20
            ? null
            : Math.round((emptyDistanceCm - reading.valueNum) * 10) / 10
      };
    })
  };
}
