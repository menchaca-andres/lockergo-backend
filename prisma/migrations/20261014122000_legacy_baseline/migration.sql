-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."CommandStatus" AS ENUM ('PENDING', 'SENT', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ComponentCategory" AS ENUM ('SENSOR', 'ACTUATOR', 'DISPLAY');

-- CreateEnum
CREATE TYPE "public"."Quality" AS ENUM ('OK', 'OUT_OF_RANGE', 'ERROR');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "public"."Severity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "public"."ValueKind" AS ENUM ('NUMBER', 'BOOLEAN', 'STRING', 'JSON');

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Command" (
    "id" SERIAL NOT NULL,
    "componentId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "params" JSONB,
    "status" "public"."CommandStatus" NOT NULL DEFAULT 'PENDING',
    "requestedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "Command_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Component" (
    "id" SERIAL NOT NULL,
    "deviceId" INTEGER NOT NULL,
    "modelId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "calibration" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ComponentModel" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "driver" TEXT NOT NULL,
    "defaultConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComponentModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ComponentType" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "public"."ComponentCategory" NOT NULL,
    "valueKind" "public"."ValueKind" NOT NULL,
    "unit" TEXT,
    "eventRules" JSONB,

    CONSTRAINT "ComponentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "lockerId" INTEGER NOT NULL,
    "boardModel" TEXT NOT NULL DEFAULT 'ESP32-38pin',
    "apiKeyHash" TEXT NOT NULL,
    "firmwareVersion" TEXT,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Event" (
    "id" BIGSERIAL NOT NULL,
    "lockerId" INTEGER NOT NULL,
    "componentId" INTEGER,
    "readingId" BIGINT,
    "type" TEXT NOT NULL,
    "severity" "public"."Severity" NOT NULL DEFAULT 'INFO',
    "detail" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Locker" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Locker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LockerAssignment" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "lockerId" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "LockerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Reading" (
    "id" BIGSERIAL NOT NULL,
    "componentId" INTEGER NOT NULL,
    "lockerId" INTEGER NOT NULL,
    "valueNum" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueText" TEXT,
    "payload" JSONB,
    "quality" "public"."Quality" NOT NULL DEFAULT 'OK',
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RefreshToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'USER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Component_deviceId_key_key" ON "public"."Component"("deviceId" ASC, "key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ComponentModel_code_key" ON "public"."ComponentModel"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ComponentType_code_key" ON "public"."ComponentType"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Device_code_key" ON "public"."Device"("code" ASC);

-- CreateIndex
CREATE INDEX "Event_lockerId_createdAt_idx" ON "public"."Event"("lockerId" ASC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Event_type_idx" ON "public"."Event"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Locker_code_key" ON "public"."Locker"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LockerAssignment_userId_lockerId_key" ON "public"."LockerAssignment"("userId" ASC, "lockerId" ASC);

-- CreateIndex
CREATE INDEX "Reading_componentId_recordedAt_idx" ON "public"."Reading"("componentId" ASC, "recordedAt" DESC);

-- CreateIndex
CREATE INDEX "Reading_lockerId_recordedAt_idx" ON "public"."Reading"("lockerId" ASC, "recordedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Command" ADD CONSTRAINT "Command_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "public"."Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Component" ADD CONSTRAINT "Component_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Component" ADD CONSTRAINT "Component_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "public"."ComponentModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ComponentModel" ADD CONSTRAINT "ComponentModel_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "public"."ComponentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "public"."Locker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "public"."Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "public"."Locker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Event" ADD CONSTRAINT "Event_readingId_fkey" FOREIGN KEY ("readingId") REFERENCES "public"."Reading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LockerAssignment" ADD CONSTRAINT "LockerAssignment_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "public"."Locker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LockerAssignment" ADD CONSTRAINT "LockerAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reading" ADD CONSTRAINT "Reading_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "public"."Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reading" ADD CONSTRAINT "Reading_lockerId_fkey" FOREIGN KEY ("lockerId") REFERENCES "public"."Locker"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
