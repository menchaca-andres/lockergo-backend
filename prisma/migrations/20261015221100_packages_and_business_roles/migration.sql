ALTER TYPE "public"."Role" RENAME VALUE 'USER' TO 'CLIENTE';
ALTER TYPE "public"."Role" ADD VALUE 'DEPOSITANTE';

ALTER TABLE "public"."User"
ALTER COLUMN "role" SET DEFAULT 'CLIENTE';

CREATE TYPE "public"."PackageStatus" AS ENUM ('PENDING', 'PICKED_UP');
CREATE TYPE "public"."PackageSize" AS ENUM ('S', 'M', 'L');

CREATE TABLE "public"."Package" (
    "id_package" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "lockerId" INTEGER NOT NULL,
    "depositorId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "status" "public"."PackageStatus" NOT NULL DEFAULT 'PENDING',
    "estimatedSize" "public"."PackageSize",
    "depositedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pickedUpAt" TIMESTAMP(3),

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id_package"),
    CONSTRAINT "Package_pickup_state_check" CHECK (
        ("status" = 'PENDING' AND "pickedUpAt" IS NULL)
        OR ("status" = 'PICKED_UP' AND "pickedUpAt" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "Package_code_key" ON "public"."Package"("code");
CREATE INDEX "Package_lockerId_status_depositedAt_idx"
ON "public"."Package"("lockerId", "status", "depositedAt" DESC);
CREATE INDEX "Package_depositorId_status_depositedAt_idx"
ON "public"."Package"("depositorId", "status", "depositedAt" DESC);
CREATE INDEX "Package_clientId_status_depositedAt_idx"
ON "public"."Package"("clientId", "status", "depositedAt" DESC);

ALTER TABLE "public"."Package"
ADD CONSTRAINT "Package_lockerId_fkey"
FOREIGN KEY ("lockerId") REFERENCES "public"."Locker"("id_locker")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Package"
ADD CONSTRAINT "Package_depositorId_fkey"
FOREIGN KEY ("depositorId") REFERENCES "public"."User"("id_user")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."Package"
ADD CONSTRAINT "Package_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "public"."User"("id_user")
ON DELETE RESTRICT ON UPDATE CASCADE;
