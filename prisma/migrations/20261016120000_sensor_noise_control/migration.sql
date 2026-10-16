CREATE TYPE "public"."ReadingPurpose" AS ENUM ('PERIODIC', 'DOOR_CLOSE');

ALTER TABLE "public"."Reading"
ADD COLUMN "purpose" "public"."ReadingPurpose" NOT NULL DEFAULT 'PERIODIC';

ALTER TABLE "public"."Component"
ADD COLUMN "consecutiveErrorCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "sensorErrorActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "stableBooleanValue" BOOLEAN,
ADD COLUMN "pendingBooleanValue" BOOLEAN,
ADD COLUMN "pendingBooleanAt" TIMESTAMP(3),
ADD COLUMN "pendingBooleanReadingId" BIGINT;

CREATE TABLE "public"."ReadingHourlyAggregate" (
    "id" SERIAL NOT NULL,
    "componentId" INTEGER NOT NULL,
    "lockerId" INTEGER NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "minimum" DOUBLE PRECISION,
    "maximum" DOUBLE PRECISION,
    "average" DOUBLE PRECISION,
    "count" BIGINT NOT NULL,
    "numericCount" BIGINT NOT NULL,
    "aggregatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReadingHourlyAggregate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReadingHourlyAggregate_componentId_hour_key"
ON "public"."ReadingHourlyAggregate"("componentId", "hour");

CREATE INDEX "ReadingHourlyAggregate_lockerId_hour_idx"
ON "public"."ReadingHourlyAggregate"("lockerId", "hour" DESC);

ALTER TABLE "public"."ReadingHourlyAggregate"
ADD CONSTRAINT "ReadingHourlyAggregate_componentId_fkey"
FOREIGN KEY ("componentId") REFERENCES "public"."Component"("id_component")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."ReadingHourlyAggregate"
ADD CONSTRAINT "ReadingHourlyAggregate_lockerId_fkey"
FOREIGN KEY ("lockerId") REFERENCES "public"."Locker"("id_locker")
ON DELETE CASCADE ON UPDATE CASCADE;
