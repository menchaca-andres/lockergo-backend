import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../src/lib/prisma';

const initialComponentTypes = [
  { code: 'distance', name: 'Distancia', category: 'SENSOR', valueKind: 'NUMBER', unit: 'cm' },
  {
    code: 'proximity',
    name: 'Proximidad',
    category: 'SENSOR',
    valueKind: 'BOOLEAN',
    unit: null,
    eventRules: { onChange: { 'false->true': 'PACKET_DETECTED', 'true->false': 'PACKET_REMOVED' } }
  },
  {
    code: 'door_contact',
    name: 'Contacto de puerta',
    category: 'SENSOR',
    valueKind: 'BOOLEAN',
    unit: null,
    eventRules: { onChange: { 'true->false': 'DOOR_OPENED', 'false->true': 'DOOR_CLOSED' } }
  }
] as const;

const initialComponentModels = [
  {
    typeCode: 'distance',
    code: 'hc-sr04',
    name: 'HC-SR04',
    driver: 'hcsr04',
    defaultConfig: { triggerPin: 25, echoPin: 19, intervalMs: 1000 }
  },
  {
    typeCode: 'proximity',
    code: 'fc-51',
    name: 'FC-51',
    driver: 'fc51',
    defaultConfig: { signalPin: 27, intervalMs: 250 }
  },
  {
    typeCode: 'door_contact',
    code: 'mc-38',
    name: 'MC-38',
    driver: 'mc38',
    defaultConfig: { signalPin: 33, pull: 'up', intervalMs: 100 }
  }
] as const;

const adminSchema = z.object({
  ADMIN_NAME: z.string().trim().min(1),
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  ADMIN_PASSWORD: z
    .string()
    .min(12)
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72)
});

async function seedCatalog(): Promise<void> {
  for (const type of initialComponentTypes) {
    await prisma.componentType.upsert({
      where: { code: type.code },
      update: {
        name: type.name,
        category: type.category,
        valueKind: type.valueKind,
        unit: type.unit,
        ...('eventRules' in type ? { eventRules: type.eventRules } : {})
      },
      create: type
    });
  }

  for (const model of initialComponentModels) {
    const type = await prisma.componentType.findUnique({
      where: { code: model.typeCode },
      select: { id_ct: true }
    });
    if (!type) throw new Error(`Seeded component type is missing: ${model.typeCode}`);

    await prisma.componentModel.upsert({
      where: { code: model.code },
      update: {
        typeId: type.id_ct,
        name: model.name,
        driver: model.driver,
        defaultConfig: model.defaultConfig,
        isActive: true
      },
      create: {
        typeId: type.id_ct,
        code: model.code,
        name: model.name,
        driver: model.driver,
        defaultConfig: model.defaultConfig
      }
    });
  }
  console.info('Component catalog seeded.');
}

async function seedAdmin(): Promise<void> {
  if (!process.env['ADMIN_EMAIL']?.trim()) {
    const existingAdmin = await prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id_user: true }
    });
    if (existingAdmin) {
      console.info('Admin account already exists; no changes made.');
      return;
    }
  }

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
  .then(seedCatalog)
  .catch((error: unknown) => {
    console.error('Failed to seed initial data:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
