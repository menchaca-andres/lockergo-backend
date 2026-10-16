import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import type {
  CreateComponentInput,
  CreateDeviceInput,
  UpdateComponentInput,
  UpdateDeviceInput
} from './devices.schemas';

const deviceSelect = {
  id_device: true,
  code: true,
  lockerId: true,
  boardModel: true,
  firmwareVersion: true,
  configVersion: true,
  lastSeenAt: true,
  isActive: true,
  createdAt: true,
  locker: { select: { id_locker: true, code: true, name: true } },
  _count: { select: { components: true } }
} as const;

const componentSelect = {
  id_component: true,
  deviceId: true,
  modelId: true,
  key: true,
  name: true,
  config: true,
  calibration: true,
  isEnabled: true,
  installedAt: true,
  model: {
    select: {
      id_cm: true,
      code: true,
      name: true,
      driver: true,
      defaultConfig: true,
      type: {
        select: {
          id_ct: true,
          code: true,
          name: true,
          category: true,
          valueKind: true,
          unit: true
        }
      }
    }
  }
} as const;

function hashDeviceKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function newDeviceKey(): string {
  return randomBytes(32).toString('base64url');
}

function asConfigObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  if (value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Device component configuration must be a JSON object');
  }
  return value;
}

export async function listDevices() {
  return prisma.device.findMany({ select: deviceSelect, orderBy: { id_device: 'asc' } });
}

export async function createDevice(input: CreateDeviceInput) {
  const locker = await prisma.locker.findFirst({
    where: { id_locker: input.lockerId, isActive: true },
    select: { id_locker: true }
  });
  if (!locker) return null;

  const apiKey = newDeviceKey();
  const device = await prisma.device.create({
    data: { ...input, apiKeyHash: hashDeviceKey(apiKey) },
    select: deviceSelect
  });
  return { device, apiKey };
}

export async function updateDevice(id: number, input: UpdateDeviceInput) {
  return prisma.$transaction(async (transaction) => {
    if (input.lockerId !== undefined) {
      const locker = await transaction.locker.findFirst({
        where: { id_locker: input.lockerId, isActive: true },
        select: { id_locker: true }
      });
      if (!locker) return null;
    }

    const { boardModel, ...data } = input;
    return transaction.device.update({
      where: { id_device: id },
      data: {
        ...data,
        ...(boardModel !== undefined ? { boardModel, configVersion: { increment: 1 } } : {})
      },
      select: deviceSelect
    });
  });
}

export async function rotateDeviceKey(id: number) {
  const apiKey = newDeviceKey();
  const device = await prisma.device.update({
    where: { id_device: id },
    data: { apiKeyHash: hashDeviceKey(apiKey) },
    select: deviceSelect
  });
  return { device, apiKey };
}

export async function getDeviceConfig(code: string) {
  const device = await prisma.device.findFirst({
    where: { code, isActive: true, locker: { isActive: true } },
    select: {
      code: true,
      boardModel: true,
      firmwareVersion: true,
      configVersion: true,
      components: {
        where: { isEnabled: true, model: { isActive: true } },
        select: {
          key: true,
          name: true,
          config: true,
          calibration: true,
          model: {
            select: {
              code: true,
              driver: true,
              defaultConfig: true,
              type: { select: { code: true, valueKind: true, unit: true, eventRules: true } }
            }
          }
        },
        orderBy: { id_component: 'asc' }
      }
    }
  });
  if (!device) return null;

  return {
    ...device,
    components: device.components.map(({ model, config, ...component }) => {
      const { defaultConfig, ...publicModel } = model;
      return {
        ...component,
        config: { ...asConfigObject(defaultConfig), ...asConfigObject(config) },
        model: publicModel
      };
    })
  };
}

export async function listDeviceComponents(deviceId: number) {
  return prisma.component.findMany({
    where: { deviceId },
    select: componentSelect,
    orderBy: { id_component: 'asc' }
  });
}

export async function deviceExists(deviceId: number) {
  return prisma.device.findUnique({
    where: { id_device: deviceId },
    select: { id_device: true }
  });
}

export async function createDeviceComponent(deviceId: number, input: CreateComponentInput) {
  return prisma.$transaction(async (transaction) => {
    const device = await transaction.device.findUnique({
      where: { id_device: deviceId },
      select: { id_device: true }
    });
    if (!device) return null;

    const model = await transaction.componentModel.findFirst({
      where: { id_cm: input.modelId, isActive: true },
      select: { id_cm: true }
    });
    if (!model) return null;

    const { modelId, calibration, ...data } = input;
    const component = await transaction.component.create({
      data: {
        ...data,
        device: { connect: { id_device: deviceId } },
        model: { connect: { id_cm: modelId } },
        ...(calibration !== undefined ? { calibration: calibration ?? Prisma.DbNull } : {})
      },
      select: componentSelect
    });
    await transaction.device.update({
      where: { id_device: deviceId },
      data: { configVersion: { increment: 1 } }
    });
    return component;
  });
}

export async function updateComponent(id: number, input: UpdateComponentInput, actorId: number) {
  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.component.findUnique({
      where: { id_component: id },
      select: { id_component: true, deviceId: true, modelId: true }
    });
    if (!existing) return null;

    if (input.modelId !== undefined) {
      const model = await transaction.componentModel.findFirst({
        where: { id_cm: input.modelId, isActive: true },
        select: { id_cm: true }
      });
      if (!model) return false;
    }

    const { modelId, calibration, ...data } = input;
    const component = await transaction.component.update({
      where: { id_component: id },
      data: {
        ...data,
        ...(modelId !== undefined ? { model: { connect: { id_cm: modelId } } } : {}),
        ...(calibration !== undefined ? { calibration: calibration ?? Prisma.DbNull } : {})
      },
      select: componentSelect
    });
    await transaction.device.update({
      where: { id_device: existing.deviceId },
      data: { configVersion: { increment: 1 } }
    });

    if (input.modelId !== undefined && input.modelId !== existing.modelId) {
      await transaction.auditLog.create({
        data: {
          userId: actorId,
          action: 'COMPONENT_MODEL_CHANGED',
          entity: 'Component',
          entityId: String(id),
          meta: {
            previousModelId: existing.modelId,
            modelId: input.modelId
          } satisfies Prisma.InputJsonObject
        }
      });
    }

    return component;
  });
}

export async function verifyDeviceKey(code: string, apiKey: string) {
  const device = await prisma.device.findFirst({
    where: { code, isActive: true, locker: { isActive: true } },
    select: { id_device: true, apiKeyHash: true }
  });
  if (!device) return null;

  const candidate = Buffer.from(hashDeviceKey(apiKey), 'hex');
  const stored = Buffer.from(device.apiKeyHash, 'hex');
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) return null;
  return device.id_device;
}

export async function resolveDeviceAccess(code: string, apiKey?: string): Promise<number | null> {
  if (apiKey) return verifyDeviceKey(code, apiKey);
  if (!env.ALLOW_UNAUTHENTICATED_DEVICE_ACCESS) return null;

  const device = await prisma.device.findFirst({
    where: { code, isActive: true, locker: { isActive: true } },
    select: { id_device: true }
  });
  return device?.id_device ?? null;
}
