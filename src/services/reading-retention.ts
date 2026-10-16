import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export async function aggregateAndDeleteExpiredReadings(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.READING_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO "public"."ReadingHourlyAggregate"
        ("componentId", "lockerId", "hour", "minimum", "maximum", "average",
         "count", "numericCount", "aggregatedAt")
      SELECT
        r."componentId",
        r."lockerId",
        date_trunc('hour', r."recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC',
        MIN(COALESCE(
          r."valueNum",
          CASE WHEN r."valueBool" IS NULL THEN NULL
               WHEN r."valueBool" THEN 1.0 ELSE 0.0 END
        )),
        MAX(COALESCE(
          r."valueNum",
          CASE WHEN r."valueBool" IS NULL THEN NULL
               WHEN r."valueBool" THEN 1.0 ELSE 0.0 END
        )),
        AVG(COALESCE(
          r."valueNum",
          CASE WHEN r."valueBool" IS NULL THEN NULL
               WHEN r."valueBool" THEN 1.0 ELSE 0.0 END
        )),
        COUNT(*)::bigint,
        COUNT(COALESCE(
          r."valueNum",
          CASE WHEN r."valueBool" IS NULL THEN NULL
               WHEN r."valueBool" THEN 1.0 ELSE 0.0 END
        ))::bigint,
        CURRENT_TIMESTAMP
      FROM "public"."Reading" r
      WHERE r."recordedAt" < ${cutoff}
      GROUP BY r."componentId", r."lockerId",
        date_trunc('hour', r."recordedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      ON CONFLICT ("componentId", "hour") DO UPDATE SET
        "minimum" = LEAST("ReadingHourlyAggregate"."minimum", EXCLUDED."minimum"),
        "maximum" = GREATEST("ReadingHourlyAggregate"."maximum", EXCLUDED."maximum"),
        "average" = CASE
          WHEN "ReadingHourlyAggregate"."numericCount" + EXCLUDED."numericCount" = 0 THEN NULL
          ELSE (
            COALESCE("ReadingHourlyAggregate"."average", 0) *
              "ReadingHourlyAggregate"."numericCount" +
            COALESCE(EXCLUDED."average", 0) * EXCLUDED."numericCount"
          ) / ("ReadingHourlyAggregate"."numericCount" + EXCLUDED."numericCount")
        END,
        "count" = "ReadingHourlyAggregate"."count" + EXCLUDED."count",
        "numericCount" = "ReadingHourlyAggregate"."numericCount" + EXCLUDED."numericCount",
        "aggregatedAt" = CURRENT_TIMESTAMP
    `;

    const deleted = await transaction.reading.deleteMany({
      where: { recordedAt: { lt: cutoff } }
    });
    return deleted.count;
  });
}
