ALTER TABLE "public"."Package"
ALTER COLUMN "depositedAt" DROP NOT NULL,
ALTER COLUMN "depositedAt" DROP DEFAULT,
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP CONSTRAINT "Package_pickup_state_check";

ALTER TABLE "public"."Package"
ADD CONSTRAINT "Package_pickup_state_check" CHECK (
    ("status" = 'PENDING' AND "pickedUpAt" IS NULL)
    OR (
        "status" = 'PICKED_UP'
        AND "depositedAt" IS NOT NULL
        AND "pickedUpAt" IS NOT NULL
    )
);

ALTER TABLE "public"."Event"
ADD COLUMN "packageId" INTEGER;

CREATE INDEX "Event_packageId_idx" ON "public"."Event"("packageId");

ALTER TABLE "public"."Event"
ADD CONSTRAINT "Event_packageId_fkey"
FOREIGN KEY ("packageId") REFERENCES "public"."Package"("id_package")
ON DELETE SET NULL ON UPDATE CASCADE;
