import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../../lib/prisma';
import type {
  CreateComponentModelInput,
  CreateComponentTypeInput,
  UpdateComponentModelInput,
  UpdateComponentTypeInput
} from './catalog.schemas';

const typeSelect = {
  id_ct: true,
  code: true,
  name: true,
  category: true,
  valueKind: true,
  unit: true,
  eventRules: true
} as const;

const modelSelect = {
  id_cm: true,
  typeId: true,
  code: true,
  name: true,
  manufacturer: true,
  driver: true,
  defaultConfig: true,
  isActive: true,
  type: { select: typeSelect }
} as const;

export async function listComponentTypes() {
  return prisma.componentType.findMany({
    select: { ...typeSelect, models: { select: modelSelect, orderBy: { id_cm: 'asc' } } },
    orderBy: { id_ct: 'asc' }
  });
}

export async function createComponentType(input: CreateComponentTypeInput) {
  const { eventRules, ...data } = input;
  return prisma.componentType.create({
    data: { ...data, ...(eventRules !== undefined ? { eventRules: eventRules ?? Prisma.DbNull } : {}) },
    select: typeSelect
  });
}

export async function updateComponentType(id: number, input: UpdateComponentTypeInput) {
  const { eventRules, ...data } = input;
  return prisma.$transaction(async (transaction) => {
    const type = await transaction.componentType.update({
      where: { id_ct: id },
      data: { ...data, ...(eventRules !== undefined ? { eventRules: eventRules ?? Prisma.DbNull } : {}) },
      select: typeSelect
    });
    const models = await transaction.componentModel.findMany({
      where: { typeId: id },
      select: { components: { select: { deviceId: true } } }
    });
    const deviceIds = [...new Set(models.flatMap((model) => model.components.map((component) => component.deviceId)))];
    if (deviceIds.length) {
      await transaction.device.updateMany({
        where: { id_device: { in: deviceIds } },
        data: { configVersion: { increment: 1 } }
      });
    }
    return type;
  });
}

export async function listComponentModels() {
  return prisma.componentModel.findMany({ select: modelSelect, orderBy: { id_cm: 'asc' } });
}

export async function createComponentModel(input: CreateComponentModelInput) {
  const { typeId, defaultConfig, ...data } = input;
  return prisma.componentModel.create({
    data: {
      ...data,
      type: { connect: { id_ct: typeId } },
      ...(defaultConfig !== undefined ? { defaultConfig: defaultConfig ?? Prisma.DbNull } : {})
    },
    select: modelSelect
  });
}

export async function updateComponentModel(id: number, input: UpdateComponentModelInput) {
  const { typeId, defaultConfig, ...data } = input;
  return prisma.$transaction(async (transaction) => {
    const model = await transaction.componentModel.update({
      where: { id_cm: id },
      data: {
        ...data,
        ...(typeId !== undefined ? { type: { connect: { id_ct: typeId } } } : {}),
        ...(defaultConfig !== undefined ? { defaultConfig: defaultConfig ?? Prisma.DbNull } : {})
      },
      select: modelSelect
    });
    const components = await transaction.component.findMany({
      where: { modelId: id },
      select: { deviceId: true }
    });
    const deviceIds = [...new Set(components.map((component) => component.deviceId))];
    if (deviceIds.length) {
      await transaction.device.updateMany({
        where: { id_device: { in: deviceIds } },
        data: { configVersion: { increment: 1 } }
      });
    }
    return model;
  });
}
