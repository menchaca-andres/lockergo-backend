import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma';
import type { CreateUserInput, UpdateUserInput } from './users.schemas';

const publicUserSelect = {
  id_user: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true
} as const;

export async function listUsers() {
  return prisma.user.findMany({
    select: publicUserSelect,
    orderBy: { id_user: 'asc' }
  });
}

export async function createUser(input: CreateUserInput) {
  const { password, ...data } = input;
  return prisma.user.create({
    data: {
      ...data,
      passwordHash: await bcrypt.hash(password, 12)
    },
    select: publicUserSelect
  });
}

export async function getUser(id: number) {
  return prisma.user.findUnique({
    where: { id_user: id },
    select: {
      ...publicUserSelect,
      assignments: {
        where: { endsAt: null },
        select: {
          locker: {
            select: {
              id_locker: true,
              code: true,
              name: true,
              location: true,
              isActive: true
            }
          }
        },
        orderBy: { startsAt: 'desc' }
      }
    }
  });
}

export async function updateUser(id: number, input: UpdateUserInput) {
  const { password, ...data } = input;
  return prisma.user.update({
    where: { id_user: id },
    data: {
      ...data,
      ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {})
    },
    select: publicUserSelect
  });
}

export async function replaceUserLockerAssignments(userId: number, lockerIds: number[]) {
  const lockers = await prisma.locker.findMany({
    where: { id_locker: { in: lockerIds }, isActive: true },
    select: { id_locker: true }
  });

  if (lockers.length !== lockerIds.length) {
    return false;
  }

  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.lockerAssignment.updateMany({
      where: {
        userId,
        endsAt: null,
        ...(lockerIds.length ? { lockerId: { notIn: lockerIds } } : {})
      },
      data: { endsAt: now }
    });

    for (const lockerId of lockerIds) {
      await transaction.lockerAssignment.upsert({
        where: { userId_lockerId: { userId, lockerId } },
        update: { startsAt: now, endsAt: null },
        create: { userId, lockerId, startsAt: now }
      });
    }
  });

  return true;
}
