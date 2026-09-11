import { Prisma, SalesInvoiceStatus } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { newGuestToken } from "../lib/guest-token.js";
import { guestInvoiceShareUrl } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import {
  attachRecurrencesToShareBundle,
  ensureShareBundleRecurrencesDue,
  formatRecurrenceApi,
  getGuestRecurrenceShare,
  type SalesInvoiceRecurrenceInput,
} from "./sales-invoice-recurrence.service.js";

const MAX_BUNDLE_INVOICES = 200;

function lineTotal(l: {
  quantity: Prisma.Decimal;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}): number {
  return Number(l.quantity) * Number(l.unitAmount) + Number(l.taxAmount);
}

const guestInvoiceSelect = {
  id: true,
  publicCode: true,
  status: true,
  currency: true,
  issueDate: true,
  paidAt: true,
  guestToken: true,
  journalEntryId: true,
  contact: { select: { name: true } },
  lines: {
    select: { quantity: true, unitAmount: true, taxAmount: true },
  },
} as const;

function mapGuestInvoice(inv: {
  id: string;
  publicCode: string;
  status: SalesInvoiceStatus;
  currency: string;
  issueDate: Date;
  paidAt: Date | null;
  guestToken: string | null;
  journalEntryId: string | null;
  contact: { name: string };
  lines: Array<{ quantity: Prisma.Decimal; unitAmount: Prisma.Decimal; taxAmount: Prisma.Decimal }>;
}) {
  const amount = inv.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const status = inv.status;
  const canPay = status === SalesInvoiceStatus.APPROVED && !inv.journalEntryId;
  return {
    id: inv.id,
    publicCode: inv.publicCode,
    contactName: inv.contact.name,
    amount,
    currency: inv.currency,
    issueDate: inv.issueDate.toISOString(),
    status,
    paidAt: inv.paidAt?.toISOString() ?? null,
    canPay,
    guestToken: inv.guestToken?.trim() || null,
  };
}

async function mintShareToken(): Promise<string> {
  const bundles = prisma.salesInvoiceShareBundle;
  if (!bundles) {
    throw new HttpError(
      500,
      "Server is out of date after a database change. Restart the backend (npm run dev) and try again.",
    );
  }
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = newGuestToken();
    const clash = await bundles.findUnique({
      where: { publicToken: candidate },
      select: { id: true },
    });
    if (!clash) {
      return candidate;
    }
  }
  throw new HttpError(500, "Could not create share link.");
}

export async function createSalesInvoiceShareBundle(
  businessId: string,
  invoiceIds: string[],
  recurrence?: SalesInvoiceRecurrenceInput | null,
): Promise<{ publicUrl: string; invoiceCount: number }> {
  const uniqueIds = [...new Set(invoiceIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length < 1) {
    throw new HttpError(400, "Select at least one invoice.");
  }
  if (uniqueIds.length > MAX_BUNDLE_INVOICES) {
    throw new HttpError(400, `You can share at most ${MAX_BUNDLE_INVOICES} invoices at once.`);
  }

  const rows = await prisma.salesInvoice.findMany({
    where: { businessId, id: { in: uniqueIds } },
    select: {
      id: true,
      status: true,
      guestToken: true,
    },
  });
  if (rows.length !== uniqueIds.length) {
    throw new HttpError(400, "One or more invoices were not found.");
  }

  const notShareable = rows.filter(
    (row) =>
      !row.guestToken?.trim() ||
      (row.status !== SalesInvoiceStatus.APPROVED && row.status !== SalesInvoiceStatus.PAID),
  );
  if (notShareable.length > 0) {
    throw new HttpError(
      400,
      "Bulk share only includes approved or paid invoices. Approve drafts first.",
    );
  }

  const order = new Map(uniqueIds.map((id, index) => [id, index]));
  const publicToken = await mintShareToken();
  const bundle = await prisma.salesInvoiceShareBundle.create({
    data: {
      businessId,
      publicToken,
      items: {
        create: uniqueIds.map((invoiceId) => ({
          invoiceId,
          sortOrder: order.get(invoiceId) ?? 0,
        })),
      },
    },
  });

  if (recurrence) {
    await attachRecurrencesToShareBundle({
      businessId,
      bundleId: bundle.id,
      invoiceIds: uniqueIds,
      recurrence,
    });
  }

  return {
    publicUrl: guestInvoiceShareUrl(publicToken),
    invoiceCount: uniqueIds.length,
  };
}

export async function getGuestInvoiceShareBundle(publicToken: string) {
  const t = publicToken?.trim();
  if (!t) {
    throw new HttpError(400, "Invalid link.");
  }

  const bundle = await prisma.salesInvoiceShareBundle.findUnique({
    where: { publicToken: t },
    select: { id: true },
  });
  if (bundle) {
    await ensureShareBundleRecurrencesDue(bundle.id);
    const full = await prisma.salesInvoiceShareBundle.findUnique({
      where: { id: bundle.id },
      include: {
        business: { select: { name: true } },
        recurrences: {
          where: { active: true },
          select: {
            id: true,
            publicToken: true,
            frequency: true,
            intervalDays: true,
            customDates: true,
            nextIssueAt: true,
            generateHour: true,
            generateMinute: true,
            endDate: true,
            active: true,
          },
          take: 1,
        },
        items: {
          orderBy: [{ sortOrder: "asc" }, { invoice: { issueDate: "desc" } }],
          include: { invoice: { select: guestInvoiceSelect } },
        },
      },
    });
    if (!full) {
      throw new HttpError(404, "Share link not found.");
    }
    return {
      businessName: full.business.name,
      createdAt: full.createdAt.toISOString(),
      recurrence: formatRecurrenceApi(full.recurrences[0] ?? null),
      invoices: full.items
        .map((item) => item.invoice)
        .filter((inv) => inv.status !== SalesInvoiceStatus.DRAFT)
        .map(mapGuestInvoice),
    };
  }

  const rec = await getGuestRecurrenceShare(t);
  if (!rec) {
    throw new HttpError(404, "Share link not found.");
  }
  return {
    businessName: rec.business.name,
    createdAt: rec.createdAt.toISOString(),
    recurrence: formatRecurrenceApi(rec),
    invoices: rec.invoices.map(mapGuestInvoice),
  };
}
