BEGIN;

ALTER TABLE "User" RENAME COLUMN "id" TO "id_user";
ALTER TABLE "Locker" RENAME COLUMN "id" TO "id_locker";
ALTER TABLE "LockerAssignment" RENAME COLUMN "id" TO "id_assignment";
ALTER TABLE "Device" RENAME COLUMN "id" TO "id_device";
ALTER TABLE "ComponentType" RENAME COLUMN "id" TO "id_ct";
ALTER TABLE "ComponentModel" RENAME COLUMN "id" TO "id_cm";
ALTER TABLE "Component" RENAME COLUMN "id" TO "id_component";
ALTER TABLE "Reading" RENAME COLUMN "id" TO "id_reading";
ALTER TABLE "Event" RENAME COLUMN "id" TO "id_event";
ALTER TABLE "Command" RENAME COLUMN "id" TO "id_command";
ALTER TABLE "RefreshToken" RENAME COLUMN "id" TO "id_rt";
ALTER TABLE "AuditLog" RENAME COLUMN "id" TO "id_al";

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

COMMIT;
