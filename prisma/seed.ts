import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../src/lib/prisma';

const adminSchema = z.object({
  ADMIN_NAME: z.string().trim().min(1),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  ADMIN_PASSWORD: z
    .string()
    .min(12)
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72)
});

async function seedAdmin(): Promise<void> {
  const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD } = adminSchema.parse(process.env);
  const existing = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL },
    select: { role: true }
  });

  if (existing) {
    if (existing.role !== 'ADMIN') {
      throw new Error(`The configured admin email is already used by a non-admin account: ${ADMIN_EMAIL}`);
    }
    console.info('Admin account already exists; no changes made.');
    return;
  }

  await prisma.user.create({
    data: {
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      role: 'ADMIN'
    }
  });
  console.info('Initial admin account created.');
}

seedAdmin()
  .catch((error: unknown) => {
    console.error('Failed to seed initial admin account:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
