import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { ActivityActorKind, Prisma, SalesInvoiceStatus } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "../lib/prisma-sales-enums.js";
import { buildPayUrl } from "../lib/public-guest-urls.js";
import { prisma } from "../lib/prisma.js";
import {
  recordCustomerSaleJournalAndLedger,
  recordMerchantCustomerWalletFeeJournalAndLedger,
} from "./sale-accounting.service.js";
import {
  listOrderCheckoutWallets,
  startGatewayWalletCheckout,
} from "./order-wallet-checkout.service.js";
import { markSalesInvoicePaidWithWalletPayment } from "./sales-invoice.service.js";
import { resolveDefaultBankSettlementAccountId } from "./sales-settlement-account.service.js";
import { ACTIVITY_EVENT, appendActivityLog } from "./activity-log.service.js";

const SIMULATOR_WEBHOOK_PROVIDER = "simulator";
const APS_WALLET_WEBHOOK_LOG_PROVIDER = "aps_wallet";

function webhookLogProviderForWalletComplete(options?: { settlementSource?: string }): string {
  if (options?.settlementSource === "aps_wallet") {
    return APS_WALLET_WEBHOOK_LOG_PROVIDER;
  }
  return SIMULATOR_WEBHOOK_PROVIDER;
}

/** Sum quantities per product (order lines may repeat the same SKU). */
function quantitiesByProductId(lines: { productId: string; quantity: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const line of lines) {
    map.set(line.productId, (map.get(line.productId) ?? 0) + line.quantity);
  }
  return map;
}

/** Lock product rows in a fixed order to avoid deadlocks under concurrent checkouts. */
async function lockProductRows(tx: Prisma.TransactionClient, productIds: string[]): Promise<void> {
  const sorted = [...new Set(productIds)].sort();
  for (const id of sorted) {
    await tx.$executeRaw`SELECT id FROM "Product" WHERE id = ${id} FOR UPDATE`;
  }
}

async function reserveStockForOrder(
  tx: Prisma.TransactionClient,
  businessId: string,
  neededByProduct: Map<string, number>,
): Promise<void> {
  const sortedIds = [...neededByProduct.keys()].sort();
  await lockProductRows(tx, sortedIds);

  const rows = await tx.product.findMany({
    where: { id: { in: sortedIds }, businessId },
    select: { id: true, name: true, stock: true, reservedStock: true },
  });

  if (rows.length !== sortedIds.length) {
    throw new HttpError(400, "One or more products are invalid for this business.");
  }

  const rowById = new Map(rows.map((r) => [r.id, r]));

  for (const id of sortedIds) {
    const row = rowById.get(id)!;
    const need = neededByProduct.get(id)!;
    const available = row.stock - row.reservedStock;
    if (available < need) {
      throw new HttpError(
        400,
        `Insufficient stock for ${row.name}. Available: ${available}, requested: ${need}.`,
      );
    }
  }

  for (const id of sortedIds) {
    const need = neededByProduct.get(id)!;
    await tx.product.update({
      where: { id },
      data: { reservedStock: { increment: need } },
    });
  }
}

async function commitReservedStockForPaidOrder(
  tx: Prisma.TransactionClient,
  businessId: string,
  lines: { productId: string; quantity: number }[],
): Promise<void> {
  const needed = quantitiesByProductId(lines);
  const sortedIds = [...needed.keys()].sort();
  await lockProductRows(tx, sortedIds);

  for (const id of sortedIds) {
    const qty = needed.get(id)!;
    const updated = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Product"
        SET stock = stock - ${qty},
            "reservedStock" = "reservedStock" - ${qty}
        WHERE id = ${id}
          AND "businessId" = ${businessId}
          AND stock >= ${qty}
          AND "reservedStock" >= ${qty}
      `,
    );
    if (updated !== 1) {
      throw new HttpError(
        409,
        "Stock changed while completing payment. Void this order and try again.",
      );
    }
  }
}

async function releaseReservedStockForCancelledOrder(
  tx: Prisma.TransactionClient,
  businessId: string,
  lines: { productId: string; quantity: number }[],
): Promise<void> {
  const needed = quantitiesByProductId(lines);
  const sortedIds = [...needed.keys()].sort();
  await lockProductRows(tx, sortedIds);

  for (const id of sortedIds) {
    const qty = needed.get(id)!;
    const updated = await tx.$executeRaw(
      Prisma.sql`
        UPDATE "Product"
        SET "reservedStock" = "reservedStock" - ${qty}
        WHERE id = ${id}
          AND "businessId" = ${businessId}
          AND "reservedStock" >= ${qty}
      `,
    );
    if (updated !== 1) {
      throw new HttpError(500, "Could not release stock reservation.");
    }
  }
}

function genPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

function genWalletProviderRef(): string {
  return `SIM-W-${randomBytes(8).toString("hex")}`;
}

function buildBusinessCodePrefix(name: string): string {
  const sanitized = name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return (sanitized.slice(0, 3) || "BUS").padEnd(3, "X");
}

function buildPublicCode(
  businessName: string,
  kind: "ORD" | "PAY" | "RCT",
  sequence: number,
): string {
  return `${buildBusinessCodePrefix(businessName)}-${kind}-${String(sequence).padStart(5, "0")}`;
}

function parsePublicCodeSequence(code: string | null | undefined): number {
  if (!code) {
    return 0;
  }
  const match = code.match(/(\d{5})$/);
  return match ? Number(match[1]) : 0;
}

async function nextOrderPublicCode(
  tx: Prisma.TransactionClient,
  businessId: string,
  businessName: string,
): Promise<string> {
  const prefix = `${buildBusinessCodePrefix(businessName)}-ORD-`;
  const last = await tx.order.findFirst({
    where: { businessId, publicCode: { startsWith: prefix } },
    orderBy: { publicCode: "desc" },
    select: { publicCode: true },
  });
  return buildPublicCode(businessName, "ORD", parsePublicCodeSequence(last?.publicCode) + 1);
}

async function nextPaymentPublicCode(
  tx: Prisma.TransactionClient,
  businessId: string,
  businessName: string,
): Promise<string> {
  const prefix = `${buildBusinessCodePrefix(businessName)}-PAY-`;
  const last = await tx.payment.findFirst({
    where: { businessId, publicCode: { startsWith: prefix } },
    orderBy: { publicCode: "desc" },
    select: { publicCode: true },
  });
  return buildPublicCode(businessName, "PAY", parsePublicCodeSequence(last?.publicCode) + 1);
}

/** Order with line items (shape of `include: { lines: true }`). */
type OrderWithLines = {
  id: string;
  businessId: string;
  total: Prisma.Decimal;
  currency: string;
  lines: Array<{
    productName: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }>;
};

async function nextReceiptNumber(
  tx: Prisma.TransactionClient,
  businessId: string,
): Promise<number> {
  const last = await tx.receipt.findFirst({
    where: { businessId },
    orderBy: { receiptNumber: "desc" },
    select: { receiptNumber: true },
  });
  return (last?.receiptNumber ?? 0) + 1;
}

async function nextReceiptPublicCode(
  tx: Prisma.TransactionClient,
  businessId: string,
  businessName: string,
): Promise<string> {
  const prefix = `${buildBusinessCodePrefix(businessName)}-RCT-`;
  const last = await tx.receipt.findFirst({
    where: { businessId, publicCode: { startsWith: prefix } },
    orderBy: { publicCode: "desc" },
    select: { publicCode: true },
  });
  return buildPublicCode(businessName, "RCT", parsePublicCodeSequence(last?.publicCode) + 1);
}

async function createReceiptRecord(
  tx: Prisma.TransactionClient,
  order: OrderWithLines,
  payment: { provider: string; providerRef: string | null },
  businessName: string,
  paymentMethodLabel: string,
) {
  const receiptNumber = await nextReceiptNumber(tx, order.businessId);
  const publicCode = await nextReceiptPublicCode(tx, order.businessId, businessName);
  const linesSnapshot = order.lines.map((line) => ({
    productName: line.productName,
    quantity: line.quantity,
    unitPrice: Number(line.unitPrice),
    lineTotal: Number(line.lineTotal),
  }));

  return tx.receipt.create({
    data: {
      businessId: order.businessId,
      orderId: order.id,
      publicCode,
      receiptNumber,
      total: order.total,
      currency: order.currency,
      linesSnapshot,
      paymentMethod: paymentMethodLabel,
      provider: payment.provider,
      providerRef: payment.providerRef,
    },
  });
}

export async function createOrder(input: {
  businessId: string;
  userId: string | null;
  lines: { productId: string; quantity: number }[];
  diningTableId?: string | null;
  tableLabelSnapshot?: string | null;
}) {
  if (input.lines.length === 0) {
    throw new HttpError(400, "Cart cannot be empty.");
  }

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const neededByProduct = quantitiesByProductId(input.lines);

  return prisma.$transaction(
    async (tx) => {
      const business = await tx.business.findUnique({
        where: { id: input.businessId },
        select: { name: true },
      });
      if (!business) {
        throw new HttpError(404, "Business not found.");
      }

      const products = await tx.product.findMany({
        where: { businessId: input.businessId, id: { in: productIds } },
      });

      if (products.length !== productIds.length) {
        throw new HttpError(400, "One or more products are invalid for this business.");
      }

      const byId = new Map(products.map((p) => [p.id, p]));
      let subtotal = new Prisma.Decimal(0);
      const lineCreates: Array<{
        product: { connect: { id: string } };
        productName: string;
        quantity: number;
        unitPrice: Prisma.Decimal;
        lineTotal: Prisma.Decimal;
      }> = [];

      for (const line of input.lines) {
        const product = byId.get(line.productId);
        if (!product) {
          throw new HttpError(400, "Invalid product in cart.");
        }
        if (line.quantity < 1) {
          throw new HttpError(400, "Each line must have quantity at least 1.");
        }

        const unitPrice = product.price;
        const lineTotal = unitPrice.mul(line.quantity);
        subtotal = subtotal.add(lineTotal);

        lineCreates.push({
          product: { connect: { id: product.id } },
          productName: product.name,
          quantity: line.quantity,
          unitPrice,
          lineTotal,
        });
      }

      await reserveStockForOrder(tx, input.businessId, neededByProduct);

      const publicCode = await nextOrderPublicCode(tx, input.businessId, business.name);

      return tx.order.create({
        data: {
          businessId: input.businessId,
          publicCode,
          status: OrderStatus.PENDING_PAYMENT,
          subtotal,
          taxAmount: new Prisma.Decimal(0),
          total: subtotal,
          currency: "GMD",
          createdByUserId: input.userId ?? undefined,
          diningTableId: input.diningTableId ?? undefined,
          tableLabelSnapshot: input.tableLabelSnapshot?.trim() || null,
          lines: {
            create: lineCreates,
          },
        },
        include: { lines: true },
      });
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function getOrderForBusiness(orderId: string, businessId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      lines: true,
      payments: {
        orderBy: { createdAt: "desc" },
        include: {
          recordedBy: { select: { id: true, name: true, email: true } },
        },
      },
      receipt: true,
      diningTable: { select: { id: true, label: true, publicToken: true } },
    },
  });
}

export type ListOrdersForBusinessParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: "all" | "pending_payment" | "paid" | "cancelled";
};

export async function listOrdersForBusiness(
  businessId: string,
  params: ListOrdersForBusinessParams,
) {
  const page = Math.max(1, params.page);
  const pageSize = Math.min(Math.max(params.pageSize, 1), 100);
  const skip = (page - 1) * pageSize;
  const q = params.search?.trim();
  const statusTab = params.status ?? "all";

  const statusWhere =
    statusTab === "all"
      ? {}
      : {
          status:
            statusTab === "pending_payment"
              ? OrderStatus.PENDING_PAYMENT
              : statusTab === "paid"
                ? OrderStatus.PAID
                : OrderStatus.CANCELLED,
        };

  const searchWhere =
    q && q.length > 0
      ? {
          OR: [
            { publicCode: { contains: q, mode: "insensitive" as const } },
            { lines: { some: { productName: { contains: q, mode: "insensitive" as const } } } },
          ],
        }
      : {};

  const where = { businessId, ...statusWhere, ...searchWhere };

  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        lines: true,
        diningTable: { select: { id: true, label: true, publicToken: true } },
      },
    }),
  ]);

  return { total, page, pageSize, orders };
}

export type StartWalletPaymentResult = {
  payment: Awaited<ReturnType<typeof prisma.payment.create>>;
  qrPayload: string;
  launchUrl: string;
  paymentHtml: string | null;
  checkoutAdapter: string;
};

export async function startWalletPayment(
  orderId: string,
  businessId: string,
  options?: { gatewayCode?: string; payerPhone?: string; recordedByUserId?: string | null },
  req?: Request,
): Promise<StartWalletPaymentResult> {
  const configuredWallets = await listOrderCheckoutWallets(businessId);
  const gatewayCode = options?.gatewayCode?.trim();

  if (configuredWallets.length > 0) {
    if (!gatewayCode) {
      throw new HttpError(
        400,
        "gatewayCode is required. Choose a wallet configured under Merchant API.",
      );
    }
    if (!req) {
      throw new HttpError(500, "Request context is required for wallet checkout.");
    }
    return startGatewayWalletCheckout({
      orderId,
      businessId,
      gatewayCode,
      payerPhone: options?.payerPhone,
      recordedByUserId: options?.recordedByUserId ?? undefined,
      req,
    });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      business: { select: { name: true } },
    },
  });

  if (!order) {
    throw new HttpError(404, "Order not found.");
  }
  if (order.status === OrderStatus.PAID) {
    throw new HttpError(400, "Order is already paid.");
  }
  if (order.status !== OrderStatus.PENDING_PAYMENT) {
    throw new HttpError(400, "Order cannot accept payment.");
  }

  const existing = await prisma.payment.findFirst({
    where: {
      orderId,
      method: PaymentMethod.QR_WALLET,
      status: PaymentStatus.PENDING,
    },
  });

  if (existing) {
    if (existing.provider !== PaymentProvider.SIMULATOR) {
      await prisma.payment.update({
        where: { id: existing.id },
        data: { status: PaymentStatus.CANCELLED },
      });
    } else {
      const url = buildPayUrl(existing.publicToken);
      return {
        payment: existing,
        qrPayload: url,
        launchUrl: url,
        paymentHtml: null,
        checkoutAdapter: "simulator",
      };
    }
  }

  const recordedByUserId = options?.recordedByUserId?.trim() || undefined;
  const payment = await prisma.payment.create({
    data: {
      businessId,
      orderId,
      publicCode: await nextPaymentPublicCode(prisma, businessId, order.business.name),
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.SIMULATOR,
      status: PaymentStatus.PENDING,
      amount: order.total,
      currency: order.currency,
      providerRef: genWalletProviderRef(),
      publicToken: genPublicToken(),
      recordedByUserId,
    },
  });

  if (recordedByUserId) {
    await appendActivityLog(prisma, {
      businessId,
      actorUserId: recordedByUserId,
      actorKind: ActivityActorKind.USER,
      eventType: ACTIVITY_EVENT.PAYMENT_WALLET_INITIATED,
      resourceType: "payment",
      resourceId: payment.id,
      metadata: {
        orderId,
        orderPublicCode: order.publicCode,
        paymentPublicCode: payment.publicCode,
        provider: "simulator",
      },
    });
  }

  const url = buildPayUrl(payment.publicToken);
  return {
    payment,
    qrPayload: url,
    launchUrl: url,
    paymentHtml: null,
    checkoutAdapter: "simulator",
  };
}

export async function completeCashPayment(
  orderId: string,
  businessId: string,
  recordedByUserId: string,
) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, businessId },
        include: { lines: true, receipt: true, business: { select: { name: true } } },
      });

      if (!order) {
        throw new HttpError(404, "Order not found.");
      }
      if (order.receipt) {
        throw new HttpError(400, "Order already settled.");
      }
      if (order.status === OrderStatus.PAID) {
        throw new HttpError(400, "Order is already paid.");
      }
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new HttpError(400, "Order cannot accept payment.");
      }

      await commitReservedStockForPaidOrder(
        tx,
        businessId,
        order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );

      await tx.payment.updateMany({
        where: {
          orderId,
          status: PaymentStatus.PENDING,
          method: PaymentMethod.QR_WALLET,
        },
        data: { status: PaymentStatus.CANCELLED },
      });

      const providerRef = `CASH-${order.publicCode}`;

      const payment = await tx.payment.create({
        data: {
          businessId,
          orderId,
          publicCode: await nextPaymentPublicCode(tx, businessId, order.business.name),
          method: PaymentMethod.CASH,
          provider: PaymentProvider.UPFRONT_PAY,
          status: PaymentStatus.COMPLETED,
          amount: order.total,
          currency: order.currency,
          providerRef,
          publicToken: genPublicToken(),
          completedAt: new Date(),
          recordedByUserId,
        },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PAID },
      });

      const orderWithLines = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { lines: true },
      });

      const receipt = await createReceiptRecord(
        tx,
        orderWithLines,
        payment,
        order.business.name,
        "Cash",
      );

      await recordCustomerSaleJournalAndLedger(tx, {
        businessId,
        orderId,
        orderPublicCode: order.publicCode,
        paymentId: payment.id,
        paymentPublicCode: payment.publicCode,
        amount: payment.amount,
        currency: payment.currency,
        provider: payment.provider,
        method: payment.method,
        status: payment.status,
        providerRef: payment.providerRef,
      });

      await appendActivityLog(tx, {
        businessId,
        actorUserId: recordedByUserId,
        actorKind: ActivityActorKind.USER,
        eventType: ACTIVITY_EVENT.PAYMENT_CASH_COMPLETED,
        resourceType: "payment",
        resourceId: payment.id,
        metadata: {
          orderPublicCode: order.publicCode,
          paymentPublicCode: payment.publicCode,
          amount: Number(payment.amount),
          currency: payment.currency,
        },
      });

      return { payment, receipt };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export type CompleteWalletPaymentByPublicTokenOptions = {
  externalEventId?: string;
  /** POS staff completing simulator wallet checkout */
  settledByStaffUserId?: string | null;
  settlementSource?: "staff_simulate" | "public_pay_simulate" | "webhook" | "aps_wallet";
};

async function completeSalesInvoiceWalletPaymentCore(
  payment: {
    id: string;
    businessId: string;
    salesInvoiceId: string | null;
    orderId: string | null;
    status: string;
    publicCode: string;
    salesInvoice: {
      id: string;
      status: SalesInvoiceStatus;
      journalEntryId: string | null;
      publicCode: string;
    } | null;
  },
  options?: CompleteWalletPaymentByPublicTokenOptions,
) {
  if (!payment.salesInvoiceId || !payment.salesInvoice) {
    throw new HttpError(500, "Sales invoice payment is missing invoice data.");
  }

  const logProvider = webhookLogProviderForWalletComplete(options);

  if (options?.externalEventId) {
    const existingLog = await prisma.webhookEventLog.findUnique({
      where: {
        provider_eventKey: {
          provider: logProvider,
          eventKey: options.externalEventId,
        },
      },
    });
    if (existingLog) {
      return {
        ok: true as const,
        duplicate: true as const,
        orderId: null as string | null,
        receiptId: null as string | null,
        salesInvoiceId: payment.salesInvoiceId,
      };
    }
  }

  if (
    payment.status === PaymentStatus.COMPLETED ||
    payment.salesInvoice.status === SalesInvoiceStatus.PAID ||
    payment.salesInvoice.journalEntryId
  ) {
    return {
      ok: true as const,
      duplicate: true as const,
      orderId: null as string | null,
      receiptId: null as string | null,
      salesInvoiceId: payment.salesInvoiceId,
    };
  }

  if (payment.status !== PaymentStatus.PENDING) {
    throw new HttpError(400, "Payment cannot be completed.");
  }

  return prisma.$transaction(
    async (tx) => {
      if (options?.externalEventId) {
        try {
          await tx.webhookEventLog.create({
            data: {
              provider: logProvider,
              eventKey: options.externalEventId,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            return {
              ok: true as const,
              duplicate: true as const,
              orderId: null as string | null,
              receiptId: null as string | null,
              salesInvoiceId: payment.salesInvoiceId,
            };
          }
          throw error;
        }
      }

      const fresh = await tx.payment.findUnique({
        where: { id: payment.id },
        include: {
          salesInvoice: {
            include: {
              lines: { orderBy: { sortOrder: "asc" } },
              contact: true,
            },
          },
        },
      });

      if (!fresh?.salesInvoice) {
        throw new HttpError(404, "Payment not found.");
      }

      if (
        fresh.status === PaymentStatus.COMPLETED ||
        fresh.salesInvoice.status === SalesInvoiceStatus.PAID ||
        fresh.salesInvoice.journalEntryId
      ) {
        return {
          ok: true as const,
          duplicate: true as const,
          orderId: null as string | null,
          receiptId: null as string | null,
          salesInvoiceId: fresh.salesInvoiceId,
        };
      }

      if (fresh.status !== PaymentStatus.PENDING) {
        throw new HttpError(400, "Payment cannot be completed.");
      }

      const settlementId =
        fresh.salesInvoice.settlementChartAccountId?.trim() ||
        (await resolveDefaultBankSettlementAccountId(fresh.businessId));

      await markSalesInvoicePaidWithWalletPayment(
        tx,
        fresh.businessId,
        fresh.salesInvoice.id,
        fresh.id,
        { settlementChartAccountId: settlementId, postedAt: new Date() },
      );

      await appendActivityLog(tx, {
        businessId: fresh.businessId,
        actorUserId: null,
        actorKind: ActivityActorKind.SYSTEM,
        eventType: ACTIVITY_EVENT.PAYMENT_SALES_INVOICE_WALLET_SETTLED,
        resourceType: "payment",
        resourceId: fresh.id,
        metadata: {
          invoicePublicCode: fresh.salesInvoice.publicCode,
          paymentPublicCode: fresh.publicCode,
        },
      });

      return {
        ok: true as const,
        duplicate: false as const,
        orderId: null as string | null,
        receiptId: null as string | null,
        salesInvoiceId: fresh.salesInvoiceId,
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function completeWalletPaymentByPublicToken(
  publicToken: string,
  options?: CompleteWalletPaymentByPublicTokenOptions,
) {
  const payment = await prisma.payment.findUnique({
    where: { publicToken },
    include: {
      order: {
        include: {
          lines: true,
          receipt: true,
          business: { select: { name: true } },
        },
      },
      salesInvoice: {
        include: {
          lines: { orderBy: { sortOrder: "asc" } },
          contact: true,
        },
      },
    },
  });

  if (!payment) {
    throw new HttpError(404, "Payment not found.");
  }
  if (payment.method !== PaymentMethod.QR_WALLET) {
    throw new HttpError(400, "Not a wallet payment.");
  }

  if (payment.salesInvoiceId && payment.salesInvoice) {
    return completeSalesInvoiceWalletPaymentCore(
      {
        id: payment.id,
        businessId: payment.businessId,
        salesInvoiceId: payment.salesInvoiceId,
        orderId: payment.orderId,
        status: payment.status,
        publicCode: payment.publicCode,
        salesInvoice: {
          id: payment.salesInvoice.id,
          status: payment.salesInvoice.status,
          journalEntryId: payment.salesInvoice.journalEntryId,
          publicCode: payment.salesInvoice.publicCode,
        },
      },
      options,
    );
  }

  if (!payment.orderId || !payment.order) {
    throw new HttpError(400, "Invalid payment — no order linked.");
  }

  const orderLogProvider = webhookLogProviderForWalletComplete(options);

  if (options?.externalEventId) {
    const existingLog = await prisma.webhookEventLog.findUnique({
      where: {
        provider_eventKey: {
          provider: orderLogProvider,
          eventKey: options.externalEventId,
        },
      },
    });
    if (existingLog) {
      return {
        ok: true as const,
        duplicate: true as const,
        orderId: payment.orderId,
        receiptId: payment.order.receipt?.id ?? null,
      };
    }
  }

  if (payment.status === PaymentStatus.COMPLETED || payment.order.status === OrderStatus.PAID) {
    return {
      ok: true as const,
      duplicate: true as const,
      orderId: payment.orderId,
      receiptId: payment.order.receipt?.id ?? null,
    };
  }

  if (payment.status !== PaymentStatus.PENDING) {
    throw new HttpError(400, "Payment cannot be completed.");
  }

  return prisma.$transaction(
    async (tx) => {
      if (options?.externalEventId) {
        try {
          await tx.webhookEventLog.create({
            data: {
              provider: orderLogProvider,
              eventKey: options.externalEventId,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          ) {
            const row = await tx.payment.findUnique({
              where: { id: payment.id },
              include: { order: { select: { id: true, receipt: { select: { id: true } } } } },
            });
            return {
              ok: true as const,
              duplicate: true as const,
              orderId: payment.orderId,
              receiptId: row?.order?.receipt?.id ?? null,
            };
          }
          throw error;
        }
      }

      const fresh = await tx.payment.findUnique({
        where: { id: payment.id },
        include: {
          order: {
            include: {
              lines: true,
              receipt: true,
              business: { select: { name: true } },
            },
          },
        },
      });

      if (!fresh) {
        throw new HttpError(404, "Payment not found.");
      }
      if (!fresh.orderId || !fresh.order) {
        throw new HttpError(400, "Invalid payment — no order linked.");
      }

      if (
        fresh.status === PaymentStatus.COMPLETED ||
        fresh.order.status === OrderStatus.PAID ||
        fresh.order.receipt
      ) {
        return {
          ok: true as const,
          duplicate: true as const,
          orderId: fresh.orderId,
          receiptId: fresh.order.receipt?.id ?? null,
        };
      }

      if (fresh.status !== PaymentStatus.PENDING) {
        throw new HttpError(400, "Payment cannot be completed.");
      }

      await commitReservedStockForPaidOrder(
        tx,
        fresh.order.businessId,
        fresh.order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );

      await tx.payment.update({
        where: { id: fresh.id },
        data: {
          status: PaymentStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: fresh.orderId },
        data: { status: OrderStatus.PAID },
      });

      const orderWithLines = await tx.order.findUniqueOrThrow({
        where: { id: fresh.orderId },
        include: { lines: true },
      });

      const updatedPayment = await tx.payment.findUniqueOrThrow({
        where: { id: fresh.id },
      });

      const receipt = await createReceiptRecord(
        tx,
        orderWithLines,
        updatedPayment,
        fresh.order.business.name,
        "QR Wallet",
      );

      const saleJournalInput = {
        businessId: fresh.order.businessId,
        orderId: fresh.orderId,
        orderPublicCode: fresh.order.publicCode,
        paymentId: updatedPayment.id,
        paymentPublicCode: updatedPayment.publicCode,
        amount: updatedPayment.amount,
        currency: updatedPayment.currency,
        provider: updatedPayment.provider,
        method: updatedPayment.method,
        status: updatedPayment.status,
        providerRef: updatedPayment.providerRef,
        gatewayCode: updatedPayment.gatewayCode,
      };
      await recordCustomerSaleJournalAndLedger(tx, saleJournalInput);
      await recordMerchantCustomerWalletFeeJournalAndLedger(tx, saleJournalInput);

      const staffId = options?.settledByStaffUserId?.trim() || null;
      const source =
        options?.settlementSource ??
        (staffId ? ("staff_simulate" as const) : ("webhook" as const));
      await appendActivityLog(tx, {
        businessId: fresh.order.businessId,
        actorUserId: staffId,
        actorKind: staffId ? ActivityActorKind.USER : ActivityActorKind.SYSTEM,
        eventType: ACTIVITY_EVENT.PAYMENT_WALLET_SETTLED,
        resourceType: "payment",
        resourceId: updatedPayment.id,
        metadata: {
          orderPublicCode: fresh.order.publicCode,
          paymentPublicCode: updatedPayment.publicCode,
          source,
        },
      });

      return {
        ok: true as const,
        duplicate: false as const,
        orderId: fresh.orderId,
        receiptId: receipt.id,
      };
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function completeWalletPaymentForOrder(
  orderId: string,
  businessId: string,
  staffUserId: string,
) {
  const payment = await prisma.payment.findFirst({
    where: {
      orderId,
      businessId,
      method: PaymentMethod.QR_WALLET,
      status: PaymentStatus.PENDING,
    },
  });

  if (!payment) {
    throw new HttpError(404, "No pending wallet payment for this order.");
  }

  if (payment.provider !== PaymentProvider.SIMULATOR) {
    throw new HttpError(
      400,
      "Demo complete applies only to simulator checkout. Use your wallet app or provider webhooks for live payments.",
    );
  }

  return completeWalletPaymentByPublicToken(payment.publicToken, {
    externalEventId: `sim-staff-${payment.id}-${Date.now()}`,
    settledByStaffUserId: staffUserId,
    settlementSource: "staff_simulate",
  });
}

/** Releases reservations and cancels pending wallet payments. Only for unpaid orders. */
export async function cancelPendingOrder(orderId: string, businessId: string) {
  return prisma.$transaction(
    async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, businessId },
        include: { lines: true, receipt: true },
      });

      if (!order) {
        throw new HttpError(404, "Order not found.");
      }
      if (order.receipt || order.status === OrderStatus.PAID) {
        throw new HttpError(400, "Only unpaid orders can be cancelled.");
      }
      if (order.status !== OrderStatus.PENDING_PAYMENT) {
        throw new HttpError(400, "Order cannot be cancelled.");
      }

      await releaseReservedStockForCancelledOrder(
        tx,
        businessId,
        order.lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );

      await tx.payment.updateMany({
        where: {
          orderId,
          status: PaymentStatus.PENDING,
          method: PaymentMethod.QR_WALLET,
        },
        data: { status: PaymentStatus.CANCELLED },
      });

      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });

      return order;
    },
    { maxWait: 10_000, timeout: 15_000 },
  );
}

export async function getPublicPayInfo(publicToken: string) {
  const payment = await prisma.payment.findUnique({
    where: { publicToken },
    include: {
      business: { select: { name: true } },
      order: { select: { id: true, status: true, total: true, currency: true } },
      salesInvoice: { select: { id: true, publicCode: true, status: true } },
    },
  });

  if (!payment) {
    throw new HttpError(404, "Payment not found.");
  }

  if (payment.salesInvoiceId && payment.salesInvoice) {
    return {
      kind: "sales_invoice" as const,
      businessName: payment.business.name,
      amount: Number(payment.amount),
      currency: payment.currency,
      invoiceStatus: payment.salesInvoice.status,
      invoiceCode: payment.salesInvoice.publicCode,
      paymentStatus: payment.status,
      method: payment.method,
    };
  }

  if (!payment.order) {
    throw new HttpError(400, "Invalid payment record.");
  }

  return {
    kind: "order" as const,
    businessName: payment.business.name,
    amount: Number(payment.amount),
    currency: payment.currency,
    orderStatus: payment.order.status,
    paymentStatus: payment.status,
    method: payment.method,
  };
}

export type PaymentsBusinessSummary = {
  completedAmount: number;
  completedCount: number;
  nonCompletedCount: number;
  walletCompletedCount: number;
};

export async function listPaymentsForBusiness(
  businessId: string,
  params: { page: number; pageSize: number },
) {
  const { page, pageSize } = params;
  const skip = (page - 1) * pageSize;

  const [total, completedAgg, completedCount, walletCompletedCount, rows] = await prisma.$transaction([
    prisma.payment.count({ where: { businessId } }),
    prisma.payment.aggregate({
      where: { businessId, status: PaymentStatus.COMPLETED },
      _sum: { amount: true },
    }),
    prisma.payment.count({ where: { businessId, status: PaymentStatus.COMPLETED } }),
    prisma.payment.count({
      where: {
        businessId,
        status: PaymentStatus.COMPLETED,
        method: PaymentMethod.QR_WALLET,
      },
    }),
    prisma.payment.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        order: { select: { id: true, publicCode: true } },
        salesInvoice: { select: { id: true, publicCode: true } },
        recordedBy: { select: { id: true, name: true, email: true } },
      },
    }),
  ]);

  const summary: PaymentsBusinessSummary = {
    completedAmount: Number(completedAgg._sum.amount ?? 0),
    completedCount,
    nonCompletedCount: total - completedCount,
    walletCompletedCount,
  };

  return { total, page, pageSize, payments: rows, summary };
}

export async function getReceiptForBusiness(receiptId: string, businessId: string) {
  const receipt = await prisma.receipt.findFirst({
    where: { id: receiptId, businessId },
    include: {
      order: {
        include: { lines: true },
      },
      business: { select: { name: true } },
    },
  });

  if (!receipt) {
    throw new HttpError(404, "Receipt not found.");
  }

  return receipt;
}

export function isSimulatorPublicPayEnabled(): boolean {
  if (process.env.SIMULATOR_ALLOW_PUBLIC_PAY === "true") {
    return true;
  }
  return process.env.NODE_ENV !== "production";
}

export function verifySimulatorWebhookSecret(headerValue: string | undefined): boolean {
  const secret = process.env.SIMULATOR_WEBHOOK_SECRET;
  if (!secret || secret.length === 0) {
    return true;
  }
  return headerValue === secret;
}
