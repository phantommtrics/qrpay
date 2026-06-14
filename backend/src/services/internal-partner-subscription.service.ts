import { InvoiceStatus, PlanCode, type BillingInterval } from "@prisma/client";

import { formatMoney, getBusinessSubscription, startSubscription } from "./subscription.service.js";

export type PartnerSubscriptionResponse = {
  businessId: string;
  partnerProvisioningExternalUserId: string | null;
  subscription: {
    id: string;
    status: string;
    billingInterval: BillingInterval;
    startDate: string;
    currentPeriodStart: string;
    currentPeriodEnd: string | null;
    contractPerpetual: boolean;
    plan: {
      code: PlanCode;
      name: string;
      currency: string;
    };
  } | null;
  pendingInvoice: {
    id: string;
    amount: string;
    currency: string;
    status: string;
    dueDate: string;
    guestToken: string | null;
  } | null;
};

export async function getInternalPartnerBusinessSubscription(
  businessId: string,
): Promise<PartnerSubscriptionResponse> {
  const result = await getBusinessSubscription(businessId);
  const sub = result.currentSubscription;
  const pending = sub?.invoices?.find((inv) => inv.status === InvoiceStatus.PENDING) ?? null;

  return {
    businessId: result.business.id,
    partnerProvisioningExternalUserId: result.business.partnerProvisioningExternalUserId,
    subscription: sub
      ? {
          id: sub.id,
          status: sub.status,
          billingInterval: sub.billingInterval,
          startDate: sub.startDate.toISOString(),
          currentPeriodStart: sub.currentPeriodStart.toISOString(),
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          contractPerpetual: sub.contractPerpetual,
          plan: {
            code: sub.plan.code,
            name: sub.plan.name,
            currency: sub.plan.currency,
          },
        }
      : null,
    pendingInvoice: pending
      ? {
          id: pending.id,
          amount: formatMoney(pending.amount),
          currency: pending.currency,
          status: pending.status,
          dueDate: pending.dueDate.toISOString(),
          guestToken: pending.guestToken ?? null,
        }
      : null,
  };
}

export async function startInternalPartnerBusinessSubscription(input: {
  businessId: string;
  planCode?: PlanCode;
  billingInterval?: BillingInterval;
}) {
  const planCode = input.planCode ?? PlanCode.BUSINESS_PRO;
  await startSubscription({
    businessId: input.businessId,
    planCode,
    billingInterval: input.billingInterval,
  });

  return getInternalPartnerBusinessSubscription(input.businessId);
}
