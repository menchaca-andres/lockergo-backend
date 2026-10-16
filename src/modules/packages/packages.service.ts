import type { PackageSize, Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import type { PublicUser } from '../auth/auth.service';
import type { CreatePackageInput, PackageListQuery } from './packages.schemas';

const packageSelect = {
  id_package: true,
  code: true,
  lockerId: true,
  depositorId: true,
  clientId: true,
  status: true,
  estimatedSize: true,
  depositedAt: true,
  pickedUpAt: true,
  createdAt: true,
  events: {
    where: { type: 'PACKAGE_DEPOSITED' },
    orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
    take: 1,
    select: { detail: true }
  },
  locker: { select: { id_locker: true, code: true, name: true, location: true } },
  depositor: { select: { id_user: true, name: true } },
  client: { select: { id_user: true, name: true } }
} satisfies Prisma.PackageSelect;

function heightFromDetail(detail: Prisma.JsonValue): number | null {
  if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) return null;
  const height = detail['estimatedHeightCm'];
  return typeof height === 'number' && Number.isFinite(height) && height >= 0 && height <= 20
    ? height
    : null;
}

function withEstimatedHeight<T extends { events: Array<{ detail: Prisma.JsonValue }> }>(packageRecord: T) {
  const { events, ...record } = packageRecord;
  return { ...record, estimatedHeightCm: events[0] ? heightFromDetail(events[0].detail) : null };
}

export async function listPackages(user: PublicUser, filters: PackageListQuery) {
  const where: Prisma.PackageWhereInput = {
    ...(user.role === 'ADMIN'
      ? {}
      : user.role === 'CLIENTE'
        ? { clientId: user.id_user }
        : { depositorId: user.id_user }),
    ...(filters.status ? { status: filters.status } : {})
  };

  const packages = await prisma.package.findMany({
    where,
    select: packageSelect,
    orderBy: [{ createdAt: 'desc' }, { id_package: 'desc' }],
    take: filters.limit
  });
  return packages.map(withEstimatedHeight);
}

export async function listPackageLockerOptions() {
  return prisma.locker.findMany({
    where: { isActive: true },
    select: { id_locker: true, code: true, name: true, location: true },
    orderBy: [{ code: 'asc' }, { id_locker: 'asc' }]
  });
}

export async function createPackage(input: CreatePackageInput, depositorId: number) {
  const [locker, client] = await Promise.all([
    prisma.locker.findFirst({
      where: { id_locker: input.lockerId, isActive: true },
      select: { id_locker: true }
    }),
    prisma.user.findFirst({
      where: { email: input.clientEmail, role: 'CLIENTE', isActive: true },
      select: { id_user: true }
    })
  ]);
  if (!locker || !client) return null;

  const packageRecord = await prisma.package.create({
    data: {
      code: input.code,
      lockerId: locker.id_locker,
      depositorId,
      clientId: client.id_user
    },
    select: packageSelect
  });
  return withEstimatedHeight(packageRecord);
}

const LOCKER_INTERNAL_HEIGHT_CM = 20;
const SMALL_SIZE_MAX_HEIGHT_CM = 6.7;
const MEDIUM_SIZE_MAX_HEIGHT_CM = 13.3;

export interface PackageSizeEstimate {
  estimatedSize: PackageSize;
  estimatedHeightCm: number;
}

export function estimatePackageSize(
  measuredDistanceCm: number | null,
  calibration: Prisma.JsonValue | null
): PackageSizeEstimate | null {
  if (measuredDistanceCm === null || !Number.isFinite(measuredDistanceCm) || measuredDistanceCm < 0) {
    return null;
  }

  const emptyDistance = calibration !== null &&
    typeof calibration === 'object' &&
    !Array.isArray(calibration) &&
    typeof calibration['emptyDistanceCm'] === 'number'
    ? calibration['emptyDistanceCm']
    : LOCKER_INTERNAL_HEIGHT_CM;
  if (!Number.isFinite(emptyDistance) || emptyDistance <= 0) return null;

  const height = emptyDistance - measuredDistanceCm;
  if (height < 0 || height > LOCKER_INTERNAL_HEIGHT_CM) return null;

  return {
    estimatedHeightCm: Math.round(height * 10) / 10,
    estimatedSize: height <= SMALL_SIZE_MAX_HEIGHT_CM
      ? 'S'
      : height <= MEDIUM_SIZE_MAX_HEIGHT_CM
        ? 'M'
        : 'L'
  };
}

export interface PackageDoorTransition {
  id_package: number;
  code: string;
  clientId: number;
  depositorId: number;
  status: 'PENDING' | 'PICKED_UP';
  estimatedSize: PackageSize | null;
  estimatedHeightCm: number | null;
  depositedAt: Date | null;
  pickedUpAt: Date | null;
}

export async function applyPackageDoorClosedTransition(
  transaction: Prisma.TransactionClient,
  input: {
    lockerId: number;
    hasPackage: boolean;
    sizeEstimate: PackageSizeEstimate | null;
  }
): Promise<PackageDoorTransition | null> {
  const packageRecord = await transaction.package.findFirst({
    where: {
      lockerId: input.lockerId,
      status: 'PENDING',
      depositedAt: input.hasPackage ? null : { not: null }
    },
    orderBy: input.hasPackage
      ? [{ createdAt: 'asc' }, { id_package: 'asc' }]
      : [{ depositedAt: 'asc' }, { id_package: 'asc' }],
    select: {
      id_package: true,
      code: true,
      clientId: true,
      depositorId: true,
      events: {
        where: { type: 'PACKAGE_DEPOSITED' },
        orderBy: [{ createdAt: 'desc' }, { id_event: 'desc' }],
        take: 1,
        select: { detail: true }
      }
    }
  });
  if (!packageRecord) return null;

  const now = new Date();
  const transition = await transaction.package.update({
    where: { id_package: packageRecord.id_package },
    data: input.hasPackage
      ? {
          depositedAt: now,
          estimatedSize: input.sizeEstimate?.estimatedSize ?? null
        }
      : { status: 'PICKED_UP', pickedUpAt: now },
    select: {
      id_package: true,
      code: true,
      clientId: true,
      depositorId: true,
      status: true,
      estimatedSize: true,
      depositedAt: true,
      pickedUpAt: true
    }
  });
  return {
    ...transition,
    estimatedHeightCm: input.hasPackage
      ? input.sizeEstimate?.estimatedHeightCm ?? null
      : packageRecord.events[0] ? heightFromDetail(packageRecord.events[0].detail) : null
  };
}
