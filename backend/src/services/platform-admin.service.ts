import { InvoiceStatus, Prisma, SubscriptionStatus } from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";

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
