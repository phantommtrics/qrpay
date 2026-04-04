import { randomBytes } from "node:crypto";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { assertRestaurantBusiness } from "./restaurant-guard.service.js";

const TOKEN_REGEX = /^[a-zA-Z0-9_-]{4,64}$/;

export function generateDiningTablePublicToken(): string {
  return randomBytes(9).toString("base64url").replace(/=/g, "").slice(0, 12);
}

export async function listDiningTables(businessId: string) {
  await assertRestaurantBusiness(businessId);
  return prisma.diningTable.findMany({
    where: { businessId },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

export async function createDiningTable(input: {
  businessId: string;
  label: string;
  publicToken?: string | null;
  sortOrder?: number;
}) {
  await assertRestaurantBusiness(input.businessId);
  const label = input.label.trim();
  if (label.length < 1) {
    throw new HttpError(400, "Table label is required.");
  }

  let publicToken = input.publicToken?.trim() || generateDiningTablePublicToken();
  if (!TOKEN_REGEX.test(publicToken)) {
    throw new HttpError(
      400,
      "Table token must be 4–64 characters: letters, digits, underscore, or hyphen.",
    );
  }

  const existing = await prisma.diningTable.findUnique({
    where: {
      businessId_publicToken: { businessId: input.businessId, publicToken },
    },
  });
  if (existing) {
    throw new HttpError(409, "This table token is already used for another table.");
  }

  return prisma.diningTable.create({
    data: {
      businessId: input.businessId,
      label,
      publicToken,
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateDiningTable(input: {
  businessId: string;
  tableId: string;
  label?: string;
  publicToken?: string | null;
  isActive?: boolean;
  sortOrder?: number;
}) {
  await assertRestaurantBusiness(input.businessId);
  const table = await prisma.diningTable.findFirst({
    where: { id: input.tableId, businessId: input.businessId },
  });
  if (!table) {
    throw new HttpError(404, "Table not found.");
  }

  const data: {
    label?: string;
    publicToken?: string;
    isActive?: boolean;
    sortOrder?: number;
  } = {};

  if (input.label !== undefined) {
    const label = input.label.trim();
    if (label.length < 1) {
      throw new HttpError(400, "Table label cannot be empty.");
    }
    data.label = label;
  }
  if (input.publicToken !== undefined && input.publicToken !== null) {
    const publicToken = input.publicToken.trim();
    if (!TOKEN_REGEX.test(publicToken)) {
      throw new HttpError(
        400,
        "Table token must be 4–64 characters: letters, digits, underscore, or hyphen.",
      );
    }
    if (publicToken !== table.publicToken) {
      const clash = await prisma.diningTable.findFirst({
        where: {
          businessId: input.businessId,
          publicToken,
          NOT: { id: table.id },
        },
      });
      if (clash) {
        throw new HttpError(409, "This table token is already used for another table.");
      }
    }
    data.publicToken = publicToken;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }

  return prisma.diningTable.update({
    where: { id: table.id },
    data,
  });
}

export async function deleteDiningTable(businessId: string, tableId: string) {
  await assertRestaurantBusiness(businessId);
  const table = await prisma.diningTable.findFirst({
    where: { id: tableId, businessId },
  });
  if (!table) {
    throw new HttpError(404, "Table not found.");
  }
  await prisma.diningTable.delete({ where: { id: table.id } });
}
