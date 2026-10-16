import type { PublicUser } from '../auth/auth.service';
import { prisma } from '../../lib/prisma';
import type { CreateLockerInput, UpdateLockerInput } from './lockers.schemas';

const lockerSelect = {
  id_locker: true,
  code: true,
  name: true,
  location: true,
  isActive: true,
  createdAt: true
} as const;

export async function listLockers(user: PublicUser) {
  if (user.role === 'DEPOSITANTE') return [];

  return prisma.locker.findMany({
    where: user.role === 'ADMIN'
      ? undefined
      : {
          isActive: true,
          OR: [
            { assignments: { some: { userId: user.id_user, endsAt: null } } },
            {
              packages: {
                some: {
                  clientId: user.id_user,
                  status: 'PENDING',
                  depositedAt: { not: null }
                }
              }
            }
          ]
        },
    select: lockerSelect,
    orderBy: { id_locker: 'asc' }
  });
}

export async function getLocker(user: PublicUser, id: number) {
  if (user.role === 'DEPOSITANTE') return null;

  return prisma.locker.findFirst({
    where: {
      id_locker: id,
      ...(user.role === 'ADMIN'
        ? {}
        : {
            isActive: true,
            OR: [
              { assignments: { some: { userId: user.id_user, endsAt: null } } },
              {
                packages: {
                  some: {
                    clientId: user.id_user,
                    status: 'PENDING',
                    depositedAt: { not: null }
                  }
                }
              }
            ]
          })
    },
    select: lockerSelect
  });
}

export async function createLocker(input: CreateLockerInput) {
  return prisma.locker.create({ data: input, select: lockerSelect });
}

export async function updateLocker(id: number, input: UpdateLockerInput) {
  return prisma.locker.update({
    where: { id_locker: id },
    data: input,
    select: lockerSelect
  });
}
