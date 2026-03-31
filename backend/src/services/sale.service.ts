import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import {
  OrderStatus,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from "../lib/prisma-sales-enums.js";
import { prisma } from "../lib/prisma.js";

const SIMULATOR_WEBHOOK_PROVIDER = "simulator";

export function getPublicWebAppBaseUrl(): string {
  const raw =
    process.env.PUBLIC_WEB_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  return raw.replace(/\/$/, "");
}

export function buildPayUrl(publicToken: string): string {
  return `${getPublicWebAppBaseUrl()}/pay/${publicToken}`;
}

function genPublicToken(): string {
  return randomBytes(16).toString("base64url");
}

function genWalletProviderRef(): string {
  return `SIM-W-${randomBytes(8).toString("hex")}`;
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

async function createReceiptRecord(
  tx: Prisma.TransactionClient,
  order: OrderWithLines,
  payment: { provider: string; providerRef: string | null },
  paymentMethodLabel: string,
) {
  const receiptNumber = await nextReceiptNumber(tx, order.businessId);
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
}) {
  if (input.lines.length === 0) {
    throw new HttpError(400, "Cart cannot be empty.");
  }

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const products = await prisma.product.findMany({
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

  return prisma.order.create({
    data: {
      businessId: input.businessId,
      status: OrderStatus.PENDING_PAYMENT,
      subtotal,
      taxAmount: new Prisma.Decimal(0),
      total: subtotal,
      currency: "GMD",
      createdByUserId: input.userId ?? undefined,
      lines: {
        create: lineCreates,
      },
    },
    include: { lines: true },
  });
}

export async function getOrderForBusiness(orderId: string, businessId: string) {
  return prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: {
      lines: true,
      payments: {
        orderBy: { createdAt: "desc" },
      },
      receipt: true,
    },
  });
}

export async function startWalletPayment(orderId: string, businessId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
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
    return {
      payment: existing,
      qrPayload: buildPayUrl(existing.publicToken),
    };
  }

  const payment = await prisma.payment.create({
    data: {
      businessId,
      orderId,
      method: PaymentMethod.QR_WALLET,
      provider: PaymentProvider.SIMULATOR,
      status: PaymentStatus.PENDING,
      amount: order.total,
      currency: order.currency,
      providerRef: genWalletProviderRef(),
      publicToken: genPublicToken(),
    },
  });

  return {
    payment,
    qrPayload: buildPayUrl(payment.publicToken),
  };
}

export async function completeCashPayment(orderId: string, businessId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, businessId },
    include: { lines: true, receipt: true },
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

  return prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: {
        orderId,
        status: PaymentStatus.PENDING,
        method: PaymentMethod.QR_WALLET,
      },
      data: { status: PaymentStatus.CANCELLED },
    });

    const providerRef = `SIM-CASH-${orderId}`;

    const payment = await tx.payment.create({
      data: {
        businessId,
        orderId,
        method: PaymentMethod.CASH,
        provider: PaymentProvider.SIMULATOR,
        status: PaymentStatus.COMPLETED,
        amount: order.total,
        currency: order.currency,
        providerRef,
        publicToken: genPublicToken(),
        completedAt: new Date(),
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

    const receipt = await createReceiptRecord(tx, orderWithLines, payment, "Cash");

    return { payment, receipt };
  });
}

export async function completeWalletPaymentByPublicToken(
  publicToken: string,
  options?: { externalEventId?: string },
) {
  const payment = await prisma.payment.findUnique({
    where: { publicToken },
    include: {
      order: { include: { lines: true, receipt: true } },
    },
  });

  if (!payment) {
    throw new HttpError(404, "Payment not found.");
  }
  if (payment.method !== PaymentMethod.QR_WALLET) {
    throw new HttpError(400, "Not a wallet payment.");
  }

  if (options?.externalEventId) {
    const existingLog = await prisma.webhookEventLog.findUnique({
      where: {
        provider_eventKey: {
          provider: SIMULATOR_WEBHOOK_PROVIDER,
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

  return prisma.$transaction(async (tx) => {
    if (options?.externalEventId) {
      await tx.webhookEventLog.create({
        data: {
          provider: SIMULATOR_WEBHOOK_PROVIDER,
          eventKey: options.externalEventId,
        },
      });
    }

    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    await tx.order.update({
      where: { id: payment.orderId },
      data: { status: OrderStatus.PAID },
    });

    const orderWithLines = await tx.order.findUniqueOrThrow({
      where: { id: payment.orderId },
      include: { lines: true },
    });

    const updatedPayment = await tx.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });

    const receipt = await createReceiptRecord(
      tx,
      orderWithLines,
      updatedPayment,
      "QR Wallet",
    );

    return {
      ok: true as const,
      duplicate: false as const,
      orderId: payment.orderId,
      receiptId: receipt.id,
    };
  });
}

export async function completeWalletPaymentForOrder(orderId: string, businessId: string) {
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

  return completeWalletPaymentByPublicToken(payment.publicToken, {
    externalEventId: `sim-staff-${payment.id}-${Date.now()}`,
  });
}

export async function getPublicPayInfo(publicToken: string) {
  const payment = await prisma.payment.findUnique({
    where: { publicToken },
    include: {
      business: { select: { name: true } },
      order: { select: { id: true, status: true, total: true, currency: true } },
    },
  });

  if (!payment) {
    throw new HttpError(404, "Payment not found.");
  }

  return {
    businessName: payment.business.name,
    amount: Number(payment.amount),
    currency: payment.currency,
    orderStatus: payment.order.status,
    paymentStatus: payment.status,
    method: payment.method,
  };
}

export async function listPaymentsForBusiness(
  businessId: string,
  params: { page: number; pageSize: number },
) {
  const { page, pageSize } = params;
  const skip = (page - 1) * pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.payment.count({ where: { businessId } }),
    prisma.payment.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: {
        order: { select: { id: true } },
      },
    }),
  ]);

  return { total, page, pageSize, payments: rows };
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
