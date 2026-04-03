import {
  BillingLedgerEntryType,
  BillingLedgerStatus,
  InvoiceStatus,
  ManualRefundReviewStatus,
  Prisma,
  SubscriptionStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  queueSubscriptionInvoiceRefundApprovedEmail,
  queueSubscriptionInvoiceRefundReviewEmail,
} from "./subscription-refund-review-email.service.js";

/** YYYY-MM-DD for the current UTC calendar day (server). */
export function utcTodayIsoDate(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function clampPage(page: number): number {
  return Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
}

export function clampPageSize(size: number, max = 100): number {
  if (!Number.isFinite(size) || size < 1) {
    return 10;
  }
  return Math.min(max, Math.floor(size));
}

export function parseDateFilterDayStart(isoDay: string | undefined): Date | undefined {
  const t = isoDay?.trim();
  if (!t) {
    return undefined;
  }
  const d = new Date(`${t}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function parseDateFilterDayEnd(isoDay: string | undefined): Date | undefined {
  const t = isoDay?.trim();
  if (!t) {
    return undefined;
  }
  const d = new Date(`${t}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export type PlatformSubscriptionFilters = {
  status?: SubscriptionStatus;
  createdFrom?: Date;
  createdTo?: Date;
};

export type PlatformListPagination = {
  page: number;
  pageSize: number;
};

export async function listPlatformSubscriptions(
  filters: PlatformSubscriptionFilters,
  pagination: PlatformListPagination,
) {
  const where: Prisma.SubscriptionWhereInput = {};
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      include: { business: true, plan: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export type PlatformInvoiceFilters = {
  status?: InvoiceStatus;
  createdFrom?: Date;
  createdTo?: Date;
};

export async function listPlatformInvoices(
  filters: PlatformInvoiceFilters,
  pagination: PlatformListPagination,
) {
  const where: Prisma.SubscriptionInvoiceWhereInput = {};
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {};
    if (filters.createdFrom) {
      where.createdAt.gte = filters.createdFrom;
    }
    if (filters.createdTo) {
      where.createdAt.lte = filters.createdTo;
    }
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscriptionInvoice.count({ where }),
    prisma.subscriptionInvoice.findMany({
      where,
      include: { business: true, plan: true },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export async function getPlatformInvoiceDetail(invoiceId: string) {
  const invoice = await prisma.subscriptionInvoice.findUnique({
    where: { id: invoiceId },
    include: {
      business: true,
      plan: true,
      subscription: true,
    },
  });
  if (!invoice) {
    throw new HttpError(404, "Invoice not found.");
  }
  return invoice;
}

export type PlatformBusinessDetailPagination = {
  membershipsPage: number;
  membershipsPageSize: number;
  subscriptionsPage: number;
  subscriptionsPageSize: number;
};

export async function getPlatformBusinessDetail(
  businessId: string,
  pagination: PlatformBusinessDetailPagination,
) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      slug: true,
      industry: true,
      ownerName: true,
      ownerEmail: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: { memberships: true, products: true },
      },
    },
  });
  if (!business) {
    throw new HttpError(404, "Business not found.");
  }

  const mSkip = (pagination.membershipsPage - 1) * pagination.membershipsPageSize;
  const sSkip = (pagination.subscriptionsPage - 1) * pagination.subscriptionsPageSize;

  const [membershipsTotal, subscriptionsTotal, memberships, subscriptions] =
    await prisma.$transaction([
      prisma.businessMembership.count({ where: { businessId } }),
      prisma.subscription.count({ where: { businessId } }),
      prisma.businessMembership.findMany({
        where: { businessId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        skip: mSkip,
        take: pagination.membershipsPageSize,
      }),
      prisma.subscription.findMany({
        where: { businessId },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        skip: sSkip,
        take: pagination.subscriptionsPageSize,
      }),
    ]);

  return {
    ...business,
    memberships,
    subscriptions,
    membershipsTotal,
    subscriptionsTotal,
  };
}

export async function listPlatformBusinessesPaginated(pagination: PlatformListPagination) {
  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.business.count(),
    prisma.business.findMany({
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: { memberships: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

export type PlatformBillingReviewFilters = {
  invoiceStatus?: InvoiceStatus;
  refundReviewStatus?: ManualRefundReviewStatus;
};

/** Whole calendar days until subscription period end (negative if already ended). */
export function subscriptionDaysRemaining(periodEnd: Date): number {
  const ms = periodEnd.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export async function listPlatformBillingReview(
  filters: PlatformBillingReviewFilters,
  pagination: PlatformListPagination,
) {
  const where: Prisma.SubscriptionInvoiceWhereInput = {};
  if (filters.invoiceStatus) {
    where.status = filters.invoiceStatus;
  }
  if (filters.refundReviewStatus) {
    where.manualRefundReviewStatus = filters.refundReviewStatus;
  }

  const skip = (pagination.page - 1) * pagination.pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.subscriptionInvoice.count({ where }),
    prisma.subscriptionInvoice.findMany({
      where,
      include: {
        business: true,
        plan: true,
        subscription: true,
        ledgerEntries: {
          where: {
            type: BillingLedgerEntryType.INVOICE_PAYMENT,
            status: BillingLedgerStatus.SUCCEEDED,
          },
          orderBy: { succeededAt: "desc" },
          take: 1,
        },
        manualRefundReviewedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: pagination.pageSize,
    }),
  ]);

  return { rows, total };
}

/** Parse YYYY-MM-DD as noon UTC for consistent calendar-day storage. */
export function parseRefundExpectedByDay(isoDate: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) {
    throw new HttpError(400, "refundExpectedBy must be YYYY-MM-DD.");
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) {
    throw new HttpError(400, "refundExpectedBy is not a valid date.");
  }
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0, 0));
}

export async function patchSubscriptionInvoiceManualRefundReview(input: {
  invoiceId: string;
  actorUserId: string;
  status: ManualRefundReviewStatus;
  note?: string | null;
  /** Required when status is APPROVED_FOR_REFUND (YYYY-MM-DD). */
  refundExpectedBy?: string | null;
  /** When APPROVED_FOR_REFUND: FULL (default) or PARTIAL. */
  refundAmountMode?: "FULL" | "PARTIAL";
  /** Required when refundAmountMode is PARTIAL. */
  refundPartialAmount?: number | null;
}) {
  const existing = await prisma.subscriptionInvoice.findUnique({
    where: { id: input.invoiceId },
  });
  if (!existing) {
    throw new HttpError(404, "Invoice not found.");
  }

  const prevStatus = existing.manualRefundReviewStatus;
  const isApproved = input.status === ManualRefundReviewStatus.APPROVED_FOR_REFUND;

  let manualRefundExpectedBy: Date | null = null;
  let manualRefundApprovedAmount: Prisma.Decimal | null = null;

  if (isApproved) {
    if (!input.refundExpectedBy?.trim()) {
      throw new HttpError(400, "refundExpectedBy (YYYY-MM-DD) is required when approving a refund.");
    }
    manualRefundExpectedBy = parseRefundExpectedByDay(input.refundExpectedBy);

    const invDec = new Prisma.Decimal(existing.amount.toString());
    const mode = input.refundAmountMode ?? "FULL";
    if (mode === "PARTIAL") {
      if (input.refundPartialAmount === undefined || input.refundPartialAmount === null) {
        throw new HttpError(400, "refundPartialAmount is required for a partial refund.");
      }
      const part = new Prisma.Decimal(input.refundPartialAmount);
      if (part.lte(0) || part.gt(invDec)) {
        throw new HttpError(
          400,
          "Partial refund amount must be greater than zero and must not exceed the invoice amount.",
        );
      }
      manualRefundApprovedAmount = part;
    }
  }

  const updated = await prisma.subscriptionInvoice.update({
    where: { id: input.invoiceId },
    data: {
      manualRefundReviewStatus: input.status,
      manualRefundNote: input.note?.trim() ? input.note.trim() : null,
      manualRefundReviewedAt: new Date(),
      manualRefundReviewedByUserId: input.actorUserId,
      manualRefundExpectedBy: isApproved ? manualRefundExpectedBy : null,
      manualRefundApprovedAmount: isApproved ? manualRefundApprovedAmount : null,
    },
    include: {
      business: true,
      plan: true,
      subscription: true,
      ledgerEntries: {
        where: {
          type: BillingLedgerEntryType.INVOICE_PAYMENT,
          status: BillingLedgerStatus.SUCCEEDED,
        },
        orderBy: { succeededAt: "desc" },
        take: 1,
      },
      manualRefundReviewedBy: { select: { id: true, name: true, email: true } },
    },
  });

  if (prevStatus !== ManualRefundReviewStatus.PENDING_REVIEW && input.status === ManualRefundReviewStatus.PENDING_REVIEW) {
    queueSubscriptionInvoiceRefundReviewEmail(updated.id);
  }
  if (
    prevStatus !== ManualRefundReviewStatus.APPROVED_FOR_REFUND &&
    input.status === ManualRefundReviewStatus.APPROVED_FOR_REFUND
  ) {
    queueSubscriptionInvoiceRefundApprovedEmail(updated.id);
  }

  return updated;
}
