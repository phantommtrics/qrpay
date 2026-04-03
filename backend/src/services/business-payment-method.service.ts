import {
  BusinessPaymentMethodStatus,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { getPaymentGatewayByCode, listEnabledPaymentGateways } from "./payment-gateway.service.js";

export async function listBusinessPaymentMethods(businessId: string) {
  return prisma.businessPaymentMethod.findMany({
    where: { businessId, status: BusinessPaymentMethodStatus.ACTIVE },
    include: { gateway: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
}

export async function addBusinessPaymentMethod(input: {
  businessId: string;
  gatewayCode: string;
  label: string;
  metadata?: Prisma.InputJsonValue;
  isDefault?: boolean;
}) {
  const gateway = await getPaymentGatewayByCode(input.gatewayCode);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  const label = input.label.trim();
  if (!label) {
    throw new HttpError(400, "Label is required.");
  }

  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.businessPaymentMethod.updateMany({
        where: { businessId: input.businessId, status: BusinessPaymentMethodStatus.ACTIVE },
        data: { isDefault: false },
      });
    }

    return tx.businessPaymentMethod.create({
      data: {
        businessId: input.businessId,
        gatewayId: gateway.id,
        label,
        metadata: input.metadata ?? undefined,
        isDefault: Boolean(input.isDefault),
        status: BusinessPaymentMethodStatus.ACTIVE,
      },
      include: { gateway: true },
    });
  });
}

export async function archiveBusinessPaymentMethod(businessId: string, methodId: string) {
  const row = await prisma.businessPaymentMethod.findFirst({
    where: { id: methodId, businessId },
  });
  if (!row) {
    throw new HttpError(404, "Payment method not found.");
  }
  return prisma.businessPaymentMethod.update({
    where: { id: methodId },
    data: { status: BusinessPaymentMethodStatus.ARCHIVED, isDefault: false },
  });
}

/** Gateways the business may add (enabled platform-wide). */
export async function listAddableGatewaysForBusiness() {
  return listEnabledPaymentGateways();
}
