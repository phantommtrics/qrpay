import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { isPetrolStationIndustry } from "./product.service.js";

export async function assertPetrolBusinessForStations(businessId: string): Promise<void> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: { industry: true },
  });
  if (!b) {
    throw new HttpError(404, "Business not found.");
  }
  if (!isPetrolStationIndustry(b.industry)) {
    throw new HttpError(400, "Stations are only used for petrol station businesses.");
  }
}

export async function listBusinessStations(businessId: string) {
  await assertPetrolBusinessForStations(businessId);
  return prisma.businessStation.findMany({
    where: { businessId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      pumps: {
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      },
    },
  });
}

export async function createBusinessStation(input: {
  businessId: string;
  name: string;
  code?: string | null;
  address?: string | null;
  sortOrder?: number;
}) {
  await assertPetrolBusinessForStations(input.businessId);
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Station name is required.");
  }
  return prisma.businessStation.create({
    data: {
      businessId: input.businessId,
      name,
      code: input.code?.trim() || null,
      address: input.address?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
    },
    include: { pumps: true },
  });
}

export async function updateBusinessStation(input: {
  businessId: string;
  stationId: string;
  name?: string;
  code?: string | null;
  address?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  await assertPetrolBusinessForStations(input.businessId);
  const existing = await prisma.businessStation.findFirst({
    where: { id: input.stationId, businessId: input.businessId },
  });
  if (!existing) {
    throw new HttpError(404, "Station not found.");
  }
  return prisma.businessStation.update({
    where: { id: input.stationId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
      ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
    include: {
      pumps: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] },
    },
  });
}

export async function deleteBusinessStation(businessId: string, stationId: string) {
  await assertPetrolBusinessForStations(businessId);
  const existing = await prisma.businessStation.findFirst({
    where: { id: stationId, businessId },
  });
  if (!existing) {
    throw new HttpError(404, "Station not found.");
  }
  const orderCount = await prisma.order.count({ where: { stationId } });
  if (orderCount > 0) {
    throw new HttpError(
      400,
      "Cannot delete a station that has orders. Deactivate it instead, or contact support.",
    );
  }
  await prisma.businessStation.delete({ where: { id: stationId } });
}

export async function createBusinessStationPump(input: {
  businessId: string;
  stationId: string;
  label: string;
  sortOrder?: number;
}) {
  await assertPetrolBusinessForStations(input.businessId);
  const station = await prisma.businessStation.findFirst({
    where: { id: input.stationId, businessId: input.businessId },
  });
  if (!station) {
    throw new HttpError(404, "Station not found.");
  }
  const label = input.label.trim();
  if (!label) {
    throw new HttpError(400, "Pump label is required.");
  }
  if (label.length > 64) {
    throw new HttpError(400, "Pump label must be at most 64 characters.");
  }
  return prisma.businessStationPump.create({
    data: {
      stationId: input.stationId,
      label,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateBusinessStationPump(input: {
  businessId: string;
  pumpId: string;
  label?: string;
  isActive?: boolean;
  sortOrder?: number;
}) {
  await assertPetrolBusinessForStations(input.businessId);
  const pump = await prisma.businessStationPump.findFirst({
    where: { id: input.pumpId },
    include: { station: true },
  });
  if (!pump || pump.station.businessId !== input.businessId) {
    throw new HttpError(404, "Pump not found.");
  }
  return prisma.businessStationPump.update({
    where: { id: input.pumpId },
    data: {
      ...(input.label !== undefined ? { label: input.label.trim() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    },
  });
}

export async function deleteBusinessStationPump(businessId: string, pumpId: string) {
  await assertPetrolBusinessForStations(businessId);
  const pump = await prisma.businessStationPump.findFirst({
    where: { id: pumpId },
    include: { station: true },
  });
  if (!pump || pump.station.businessId !== businessId) {
    throw new HttpError(404, "Pump not found.");
  }
  const orderCount = await prisma.order.count({ where: { pumpId } });
  if (orderCount > 0) {
    throw new HttpError(
      400,
      "Cannot delete a pump that has orders. Deactivate it instead.",
    );
  }
  await prisma.businessStationPump.delete({ where: { id: pumpId } });
}
