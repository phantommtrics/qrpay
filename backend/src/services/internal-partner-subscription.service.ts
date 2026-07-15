import { InvoiceStatus, PlanCode, type BillingInterval } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { guestSubscriptionInvoiceUrl } from "../lib/public-guest-urls.js";
import {
  formatPartnerBillingAssignment,
  type PartnerBillingAssignment,
} from "./corporate-billing.service.js";
import { queueAnalyticsBiPartnerCorporateSubscriptionEmails } from "./internal-partner-analytics-bi-email.service.js";
import { queueInternalPartnerSubscriptionUpdated } from "./internal-partner-webhook-queue.service.js";
import { formatMoney, getBusinessSubscription, startSubscription } from "./subscription.service.js";

export type { PartnerBillingAssignment };

export type PartnerSubscriptionResponse = {
  businessId: string;
  partnerProvisioningExternalUserId: string | null;
  /** Corporate billing template assigned to this business, or an explicit unassigned message. */
  billing: PartnerBillingAssignment;
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

export type PartnerSubscriptionPayableInvoiceResponse = PartnerSubscriptionResponse & {
  payUrl: string;
  invoiceCreated: boolean;
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
    billing: formatPartnerBillingAssignment(result.business, sub?.billingInterval ?? null),
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
  const planCode = input.planCode ?? PlanCode.CORPORATE;

  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { platformBillingWaived: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const { invoice } = await startSubscription({
    businessId: input.businessId,
    planCode,
    billingInterval: input.billingInterval,
  });

  if (!business.platformBillingWaived && planCode === PlanCode.CORPORATE) {
    queueAnalyticsBiPartnerCorporateSubscriptionEmails({
      businessId: input.businessId,
      invoiceId: invoice.id,
    });
  }

  return getInternalPartnerBusinessSubscription(input.businessId);
}

export async function issueInternalPartnerSubscriptionPayableInvoice(
  businessId: string,
): Promise<PartnerSubscriptionPayableInvoiceResponse> {
  const hadPendingBefore = await prisma.subscriptionInvoice.findFirst({
    where: { businessId, status: InvoiceStatus.PENDING },
    select: { id: true },
  });

  await getBusinessSubscription(businessId);

  const data = await getInternalPartnerBusinessSubscription(businessId);
  const guestToken = data.pendingInvoice?.guestToken?.trim();
  if (!guestToken) {
    throw new HttpError(
      409,
      "No payable subscription invoice is available. Start a subscription or wait until the billing period requires payment.",
    );
  }

  const invoiceCreated = !hadPendingBefore && data.pendingInvoice !== null;
  if (invoiceCreated) {
    void queueInternalPartnerSubscriptionUpdated(businessId).catch((err) => {
      console.error("[internal-partner-subscription] subscription.updated webhook failed:", err);
    });
  }

  return {
    ...data,
    payUrl: guestSubscriptionInvoiceUrl(guestToken),
    invoiceCreated,
  };
}
