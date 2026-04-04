import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

export const GATEWAY_CODE_WAVE_GAMBIA = "wave_gambia";
export const GATEWAY_CODE_YONNA_WALLET = "yonna_wallet";

/** Subscription checkout integrations (gateway.checkoutAdapter). */
export const CHECKOUT_ADAPTER_WAVE_GAMBIA = "wave_gambia";
export const CHECKOUT_ADAPTER_YONNA_WALLET = "yonna_wallet";

const GATEWAY_CODE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

function normalizeGatewayCode(raw: string) {
  return raw.trim().toLowerCase();
}

export async function listPaymentGatewaysForPlatform() {
  return prisma.paymentGateway.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listEnabledPaymentGateways() {
  return prisma.paymentGateway.findMany({
    where: { isEnabled: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function getPaymentGatewayByCode(code: string) {
  return prisma.paymentGateway.findUnique({
    where: { code: code.trim().toLowerCase() },
  });
}

export async function updatePaymentGateway(
  id: string,
  input: {
    isEnabled?: boolean;
    name?: string;
    description?: string | null;
    sortOrder?: number;
    checkoutAdapter?: string | null;
  },
) {
  const existing = await prisma.paymentGateway.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Payment gateway not found.");
  }
  return prisma.paymentGateway.update({
    where: { id },
    data: {
      ...(input.isEnabled !== undefined ? { isEnabled: input.isEnabled } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description?.trim() || null }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.checkoutAdapter !== undefined
        ? {
            checkoutAdapter:
              input.checkoutAdapter === null
                ? null
                : input.checkoutAdapter.trim() === ""
                  ? null
                  : input.checkoutAdapter.trim(),
          }
        : {}),
    },
  });
}

export async function createPaymentGateway(input: {
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isEnabled?: boolean;
  checkoutAdapter?: string | null;
}) {
  const code = normalizeGatewayCode(input.code);
  if (!GATEWAY_CODE_PATTERN.test(code)) {
    throw new HttpError(
      400,
      "Code must start with a letter and use only lowercase letters, digits, and underscores (max 63 chars).",
    );
  }
  const name = input.name.trim();
  if (!name) {
    throw new HttpError(400, "Name is required.");
  }
  const checkoutAdapter =
    input.checkoutAdapter === undefined || input.checkoutAdapter === null
      ? null
      : input.checkoutAdapter.trim() === ""
        ? null
        : input.checkoutAdapter.trim();

  return prisma.paymentGateway.create({
    data: {
      code,
      name,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 0,
      isEnabled: input.isEnabled ?? false,
      checkoutAdapter,
    },
  });
}

export async function deletePaymentGateway(id: string) {
  const existing = await prisma.paymentGateway.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Payment gateway not found.");
  }
  await prisma.paymentGateway.delete({ where: { id } });
}
