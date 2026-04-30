import {
  BillingInterval,
  InvoiceStatus,
  PlanCode,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { newGuestToken } from "../lib/guest-token.js";
import { cancelPendingInvoicePaymentLedgers } from "./billing-ledger.service.js";
import { billingPeriodEndFromStart, createInvoiceReference, dueInDays } from "../utils/billing.js";
import { queueSubscriptionInvoiceOwnerEmail } from "./subscription-invoice-email.service.js";
import { getPlanEntitlementsDetail } from "./system-catalog.service.js";
import { isCorporateIndustry } from "../utils/corporate-industry.js";

function planAmountForCatalogPlan(
  plan: { monthlyPrice: Prisma.Decimal; yearlyPrice: Prisma.Decimal },
  interval: BillingInterval,
): Prisma.Decimal {
  return interval === BillingInterval.YEARLY ? plan.yearlyPrice : plan.monthlyPrice;
}

/** Amount from a corporate billing template for the selected cadence. */
export function corporateTemplateAmountForInterval(
  cp: {
    monthlyPrice: Prisma.Decimal;
    quarterlyPrice: Prisma.Decimal;
    halfYearlyPrice: Prisma.Decimal;
    yearlyPrice: Prisma.Decimal;
    twoYearPrice: Prisma.Decimal;
    contractPrice: Prisma.Decimal;
  },
  interval: BillingInterval,
): Prisma.Decimal {
  switch (interval) {
    case BillingInterval.MONTHLY:
      return cp.monthlyPrice;
    case BillingInterval.QUARTERLY:
      return cp.quarterlyPrice;
    case BillingInterval.HALF_YEARLY:
      return cp.halfYearlyPrice;
    case BillingInterval.YEARLY:
      return cp.yearlyPrice;
    case BillingInterval.TWO_YEARS:
      return cp.twoYearPrice;
    case BillingInterval.CONTRACT_INFINITE:
      return cp.contractPrice;
    default:
      return cp.monthlyPrice;
  }
}

export function assertCorporateTemplateHasPriceForInterval(
  cp: {
    monthlyPrice: Prisma.Decimal;
    quarterlyPrice: Prisma.Decimal;
    halfYearlyPrice: Prisma.Decimal;
    yearlyPrice: Prisma.Decimal;
    twoYearPrice: Prisma.Decimal;
    contractPrice: Prisma.Decimal;
  },
  interval: BillingInterval,
): void {
  const amt = corporateTemplateAmountForInterval(cp, interval);
  if (Number(amt) <= 0) {
    throw new HttpError(
      400,
      "This corporate billing template does not define a positive price for the selected billing cycle.",
    );
  }
}

/**
 * Resolves invoice amount for a subscription line: corporate assigned template, $0 pending quote, or catalog plan.
 */
export async function resolveSubscriptionInvoiceAmount(
  tx: Prisma.TransactionClient,
  businessId: string,
  plan: { monthlyPrice: Prisma.Decimal; yearlyPrice: Prisma.Decimal; currency: string },
  billingInterval: BillingInterval,
): Promise<{ amount: Prisma.Decimal; currency: string }> {
  const business = await tx.business.findUnique({
    where: { id: businessId },
    include: { corporateBillingPlan: true },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }
  if (isCorporateIndustry(business.industry)) {
    if (!business.corporateBillingPlanId || !business.corporateBillingPlan) {
      return { amount: new Prisma.Decimal(0), currency: plan.currency };
    }
    const cp = business.corporateBillingPlan;
    const amt = corporateTemplateAmountForInterval(cp, billingInterval);
    return { amount: amt, currency: cp.currency || plan.currency };
  }
  return {
    amount: planAmountForCatalogPlan(plan, billingInterval),
    currency: plan.currency,
  };
}

export async function listCorporateBillingPlansForPlatform() {
  return prisma.corporateBillingPlan.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function createCorporateBillingPlan(input: {
  name: string;
  monthlyPrice: number;
  quarterlyPrice?: number;
  halfYearlyPrice?: number;
  yearlyPrice: number;
  twoYearPrice?: number;
  contractPrice?: number;
  sortOrder?: number;
}) {
  const name = input.name.trim();
  if (name.length < 2) {
    throw new HttpError(400, "Name is required.");
  }
  const req = (n: number | undefined, label: string) => {
    if (n === undefined) {
      return 0;
    }
    if (!Number.isFinite(n) || n < 0) {
      throw new HttpError(400, `${label} must be zero or a positive number.`);
    }
    return n;
  };
  const monthlyPrice = req(input.monthlyPrice, "Monthly price");
  const yearlyPrice = req(input.yearlyPrice, "Yearly price");
  if (monthlyPrice <= 0 || yearlyPrice <= 0) {
    throw new HttpError(400, "Monthly and yearly list prices must be greater than zero (other cycles can be zero until you set them).");
  }
  return prisma.corporateBillingPlan.create({
    data: {
      name,
      monthlyPrice: new Prisma.Decimal(monthlyPrice.toFixed(2)),
      quarterlyPrice: new Prisma.Decimal((input.quarterlyPrice ?? 0).toFixed(2)),
      halfYearlyPrice: new Prisma.Decimal((input.halfYearlyPrice ?? 0).toFixed(2)),
      yearlyPrice: new Prisma.Decimal(yearlyPrice.toFixed(2)),
      twoYearPrice: new Prisma.Decimal((input.twoYearPrice ?? 0).toFixed(2)),
      contractPrice: new Prisma.Decimal((input.contractPrice ?? 0).toFixed(2)),
      sortOrder: input.sortOrder ?? 0,
    },
  });
}

export async function updateCorporateBillingPlan(
  id: string,
  input: Partial<{
    name: string;
    monthlyPrice: number;
    quarterlyPrice: number;
    halfYearlyPrice: number;
    yearlyPrice: number;
    twoYearPrice: number;
    contractPrice: number;
    sortOrder: number;
    isActive: boolean;
  }>,
) {
  const existing = await prisma.corporateBillingPlan.findUnique({ where: { id } });
  if (!existing) {
    throw new HttpError(404, "Corporate billing plan not found.");
  }
  const data: Prisma.CorporateBillingPlanUpdateInput = {};
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) {
      throw new HttpError(400, "Name is required.");
    }
    data.name = name;
  }
  const patchMoney = (v: number | undefined, key: keyof Prisma.CorporateBillingPlanUpdateInput) => {
    if (v === undefined) {
      return;
    }
    if (!Number.isFinite(v) || v < 0) {
      throw new HttpError(400, "Amount must be zero or positive.");
    }
    (data as Record<string, unknown>)[key as string] = new Prisma.Decimal(v.toFixed(2));
  };
  patchMoney(input.monthlyPrice, "monthlyPrice");
  patchMoney(input.quarterlyPrice, "quarterlyPrice");
  patchMoney(input.halfYearlyPrice, "halfYearlyPrice");
  patchMoney(input.yearlyPrice, "yearlyPrice");
  patchMoney(input.twoYearPrice, "twoYearPrice");
  patchMoney(input.contractPrice, "contractPrice");
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }
  return prisma.corporateBillingPlan.update({
    where: { id },
    data,
  });
}

export async function listCorporateBusinesses() {
  const rows = await prisma.business.findMany({
    where: {
      industry: { equals: "Corporate", mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    include: {
      corporateBillingPlan: true,
      subscriptions: {
        where: {
          status: {
            in: [
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.PAST_DUE,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
  });
  return rows;
}

export async function getCorporateEntitlementCatalog() {
  try {
    const plan = await getPlanEntitlementsDetail(PlanCode.BUSINESS_PRO);
    const items = plan.planSystemProducts
      .filter((l) => l.systemProduct?.slug)
      .map((l) => ({
        id: l.systemProduct.id,
        serviceId: l.systemProduct.serviceId,
        serviceName: l.systemProduct.service.name,
        name: l.systemProduct.name,
        slug: l.systemProduct.slug,
      }));
    return {
      planCode: PlanCode.CORPORATE,
      items,
    };
  } catch (e) {
    if (e instanceof HttpError && e.statusCode === 404) {
      throw new HttpError(
        503,
        "Business Pro plan is missing from the database. From the backend folder run: npx prisma db seed",
      );
    }
    throw e;
  }
}

export async function assignCorporateBusinessSettings(input: {
  businessId: string;
  corporateBillingPlanId: string;
  billingInterval: BillingInterval;
  corporateEntitlementSystemProductIds?: string[];
}) {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    include: {
      corporateBillingPlan: true,
      subscriptions: {
        where: {
          status: {
            in: [
              SubscriptionStatus.TRIALING,
              SubscriptionStatus.ACTIVE,
              SubscriptionStatus.PAST_DUE,
            ],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { plan: true },
      },
    },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }
  if (!isCorporateIndustry(business.industry)) {
    throw new HttpError(400, "This business is not a Corporate organization.");
  }

  const planRow = await prisma.corporateBillingPlan.findFirst({
    where: { id: input.corporateBillingPlanId, isActive: true },
  });
  if (!planRow) {
    throw new HttpError(404, "Corporate billing plan not found.");
  }
  assertCorporateTemplateHasPriceForInterval(planRow, input.billingInterval);

  const entitlementIds = input.corporateEntitlementSystemProductIds;
  if (entitlementIds && entitlementIds.length > 0) {
    const found = await prisma.systemProduct.findMany({
      where: { id: { in: entitlementIds } },
      select: { id: true },
    });
    if (found.length !== entitlementIds.length) {
      throw new HttpError(400, "One or more entitlement products are invalid.");
    }
  }

  const sub = business.subscriptions[0];
  if (!sub) {
    throw new HttpError(400, "No active subscription for this business.");
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.business.update({
      where: { id: business.id },
      data: {
        corporateBillingPlanId: input.corporateBillingPlanId,
        corporateBillingInterval: input.billingInterval,
        ...(entitlementIds !== undefined
          ? { corporateEntitlementSystemProductIds: entitlementIds }
          : {}),
      },
    });

    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        billingInterval: input.billingInterval,
        ...(input.billingInterval === BillingInterval.CONTRACT_INFINITE
          ? { contractPerpetual: false }
          : {}),
      },
    });

    const refreshed = await tx.subscription.findUniqueOrThrow({
      where: { id: sub.id },
      include: { plan: true },
    });

    const pendingToVoid = await tx.subscriptionInvoice.findMany({
      where: { subscriptionId: sub.id, status: InvoiceStatus.PENDING },
      select: { id: true },
    });
    for (const row of pendingToVoid) {
      await cancelPendingInvoicePaymentLedgers(tx, row.id);
    }
    await tx.subscriptionInvoice.updateMany({
      where: { subscriptionId: sub.id, status: InvoiceStatus.PENDING },
      data: {
        status: InvoiceStatus.VOID,
        checkoutSessionId: null,
        checkoutProvider: null,
      },
    });

    const { amount, currency: invoiceCurrency } = await resolveSubscriptionInvoiceAmount(
      tx,
      business.id,
      refreshed.plan,
      input.billingInterval,
    );

    const periodEnd = billingPeriodEndFromStart(refreshed.currentPeriodStart, input.billingInterval);

    const invoice = await tx.subscriptionInvoice.create({
      data: {
        businessId: business.id,
        subscriptionId: refreshed.id,
        planId: refreshed.planId,
        amount,
        currency: invoiceCurrency,
        status: InvoiceStatus.PENDING,
        billingPeriodStart: refreshed.currentPeriodStart,
        billingPeriodEnd: periodEnd,
        dueDate: dueInDays(new Date(), 7),
        externalReference: createInvoiceReference(),
        guestToken: newGuestToken(),
      },
    });

    return { subscription: refreshed, invoice };
  });

  queueSubscriptionInvoiceOwnerEmail(result.invoice.id);
  return result;
}
