import { ActivityActorKind, type Prisma } from "@prisma/client";

import { prisma } from "../lib/prisma.js";

export type ActivityDb = Prisma.TransactionClient | typeof prisma;

/** Stable event names for filtering and future i18n. */
export const ACTIVITY_EVENT = {
  PAYMENT_CASH_COMPLETED: "payment.cash_completed",
  PAYMENT_WALLET_INITIATED: "payment.wallet_initiated",
  PAYMENT_WALLET_SETTLED: "payment.wallet_settled",
  PAYMENT_SALES_INVOICE_WALLET_SETTLED: "payment.sales_invoice_wallet_settled",
  PRODUCT_CREATED: "product.created",
  PRODUCT_UPDATED: "product.updated",
  STAFF_USER_INVITED: "staff.user_invited",
  STAFF_MEMBERSHIP_STATUS_CHANGED: "staff.membership_status_changed",
  PLATFORM_JOURNAL_MANUAL_POSTED: "platform.journal.manual_posted",
  PLATFORM_JOURNAL_REVERSED: "platform.journal.reversed",
  PLATFORM_BILL_PAID: "platform.bill.paid",
  DIGITALOCEAN_INVOICE_POSTED: "platform.digitalocean.invoice_posted",
  WAVE_SELF_SETTLEMENT_SUCCEEDED: "wave.self_settlement.succeeded",
} as const;

export async function appendActivityLog(
  db: ActivityDb,
  input: {
    /** Omit or null for platform-scoped events (no tenant). */
    businessId?: string | null;
    actorUserId: string | null;
    actorKind: ActivityActorKind;
    eventType: string;
    resourceType: string;
    resourceId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await db.activityLog.create({
    data: {
      businessId: input.businessId ?? null,
      actorUserId: input.actorUserId ?? undefined,
      actorKind: input.actorKind,
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? undefined,
      metadata: input.metadata ?? undefined,
    },
  });
}

export type ListActivityLogsParams = {
  page: number;
  pageSize: number;
  /** Exact `eventType` match */
  eventType?: string | null;
  actorKind?: ActivityActorKind | null;
};

export type ListPlatformTenantActivityLogsParams = ListActivityLogsParams & {
  /** Inclusive lower bound on `createdAt` */
  from?: Date | null;
  /** Inclusive upper bound on `createdAt` */
  to?: Date | null;
  /** Restrict to one business */
  businessId?: string | null;
  /** Case-insensitive substring match on business name */
  businessNameContains?: string | null;
};

export async function listActivityLogsForBusiness(businessId: string, params: ListActivityLogsParams) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(Math.max(params.pageSize, 1), 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.ActivityLogWhereInput = { businessId };
  const et = params.eventType?.trim();
  if (et) {
    where.eventType = et;
  }
  if (params.actorKind === ActivityActorKind.USER || params.actorKind === ActivityActorKind.SYSTEM) {
    where.actorKind = params.actorKind;
  }

  const [total, rows] = await prisma.$transaction([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        actorUser: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { total, page, pageSize, logs: rows };
}

export async function listActivityLogsForPlatformTenants(params: ListPlatformTenantActivityLogsParams) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(Math.max(params.pageSize, 1), 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.ActivityLogWhereInput = {
    businessId: { not: null },
  };

  const bid = params.businessId?.trim();
  if (bid) {
    where.businessId = bid;
  }

  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      where.createdAt.gte = params.from;
    }
    if (params.to) {
      where.createdAt.lte = params.to;
    }
  }

  const nameQ = params.businessNameContains?.trim();
  if (nameQ) {
    where.business = {
      name: { contains: nameQ, mode: "insensitive" },
    };
  }

  const et = params.eventType?.trim();
  if (et) {
    where.eventType = et;
  }
  if (params.actorKind === ActivityActorKind.USER || params.actorKind === ActivityActorKind.SYSTEM) {
    where.actorKind = params.actorKind;
  }

  const [total, rows] = await prisma.$transaction([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        actorUser: { select: { id: true, name: true, email: true } },
        business: { select: { id: true, name: true } },
      },
    }),
  ]);

  return { total, page, pageSize, logs: rows };
}

export async function listActivityLogsForPlatform(params: ListActivityLogsParams) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(Math.max(params.pageSize, 1), 100);
  const skip = (page - 1) * pageSize;

  const where: Prisma.ActivityLogWhereInput = { businessId: { equals: null } };
  const et = params.eventType?.trim();
  if (et) {
    where.eventType = et;
  }
  if (params.actorKind === ActivityActorKind.USER || params.actorKind === ActivityActorKind.SYSTEM) {
    where.actorKind = params.actorKind;
  }

  const [total, rows] = await prisma.$transaction([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        actorUser: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  return { total, page, pageSize, logs: rows };
}
