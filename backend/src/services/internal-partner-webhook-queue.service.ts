import crypto from "node:crypto";

import {
  PartnerOutboundWebhookJobStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";

import { prisma } from "../lib/prisma.js";
import { formatPartnerBillingAssignment } from "./corporate-billing.service.js";
import {
  loadPartnerWebhookTargets,
  partnerWebhookSigningSecretForUrl,
} from "./partner-webhook-endpoint.service.js";

const BACKOFF_MS = [
  30_000, 120_000, 300_000, 900_000, 3_600_000, 7_200_000, 14_400_000, 28_800_000,
];

let workerStarted = false;

async function partnerWebhookUrlsForBusiness(
  internalPartnerWebhookUrl: string | null | undefined,
): Promise<string[]> {
  const perBiz = internalPartnerWebhookUrl?.trim();
  if (perBiz) {
    if (!(await partnerWebhookSigningSecretForUrl(perBiz))) {
      return [];
    }
    return [perBiz];
  }
  const targets = await loadPartnerWebhookTargets();
  return targets.map((t) => t.url);
}

export async function enqueuePartnerOutboundWebhookJob(
  webhookUrl: string,
  bodyText: string,
): Promise<{ id: string } | null> {
  const url = webhookUrl.trim();
  if (!url) {
    return null;
  }
  const row = await prisma.partnerOutboundWebhookJob.create({
    data: {
      webhookUrl: url,
      bodyText,
      status: PartnerOutboundWebhookJobStatus.PENDING,
      nextAttemptAt: new Date(),
    },
  });
  return { id: row.id };
}

export type InternalPartnerWalletCompleteResult = {
  ok: true;
  duplicate: boolean;
  orderId: string | null;
  receiptId: string | null;
};

export async function queueInternalPartnerPaymentCompleted(
  result: InternalPartnerWalletCompleteResult,
): Promise<void> {
  if (result.duplicate || !result.orderId) {
    return;
  }

  const order = await prisma.order.findUnique({
    where: { id: result.orderId },
    select: {
      id: true,
      publicCode: true,
      partnerExternalBookingId: true,
      partnerOrderCategory: true,
      businessId: true,
      business: {
        select: {
          partnerProvisioningExternalUserId: true,
          platformBillingWaived: true,
          internalPartnerWebhookUrl: true,
        },
      },
    },
  });
  if (!order?.partnerExternalBookingId?.trim() || !order.business.platformBillingWaived) {
    return;
  }

  const payment = await prisma.payment.findFirst({
    where: {
      orderId: order.id,
      status: PaymentStatus.COMPLETED,
      method: PaymentMethod.QR_WALLET,
    },
    orderBy: { completedAt: "desc" },
  });
  if (!payment) {
    return;
  }

  const urls = await partnerWebhookUrlsForBusiness(order.business.internalPartnerWebhookUrl);
  if (urls.length === 0) {
    console.warn(
      "[internal-partner] Webhook not queued: add partner webhook endpoints under Platform → Security → Partnership config, or set INTERNAL_PARTNER_WEBHOOK_URL and INTERNAL_PARTNER_WEBHOOK_SECRET in env (comma-separated URLs; optional INTERNAL_PARTNER_WEBHOOK_SECRETS for per-URL keys). Per-business webhookUrl requires a matching signing secret.",
    );
    return;
  }

  const body = {
    event: "payment.completed" as const,
    businessId: order.businessId,
    partnerProvisioningExternalUserId: order.business.partnerProvisioningExternalUserId,
    partnerExternalBookingId: order.partnerExternalBookingId,
    category: order.partnerOrderCategory,
    orderId: order.id,
    orderPublicCode: order.publicCode,
    paymentId: payment.id,
    paymentPublicCode: payment.publicCode,
    paymentStatus: payment.status,
    amount: Number(payment.amount),
    currency: payment.currency,
    provider: payment.provider,
    gatewayCode: payment.gatewayCode,
    providerRef: payment.providerRef,
    occurredAt: payment.completedAt?.toISOString() ?? new Date().toISOString(),
  };

  const bodyText = JSON.stringify(body);
  for (const url of urls) {
    await enqueuePartnerOutboundWebhookJob(url, bodyText);
  }
}

export async function queueInternalPartnerPaymentCancelledForPaymentIds(
  paymentIds: string[],
  reason: string,
): Promise<void> {
  const unique = [...new Set(paymentIds.filter(Boolean))];

  for (const paymentId of unique) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        publicCode: true,
        status: true,
        businessId: true,
        orderId: true,
        order: {
          select: {
            id: true,
            publicCode: true,
            partnerExternalBookingId: true,
            partnerOrderCategory: true,
            business: {
              select: {
                partnerProvisioningExternalUserId: true,
                platformBillingWaived: true,
                internalPartnerWebhookUrl: true,
              },
            },
          },
        },
      },
    });
    if (!payment?.orderId || !payment.order?.partnerExternalBookingId?.trim()) {
      continue;
    }
    if (!payment.order.business.platformBillingWaived) {
      continue;
    }

    const urls = await partnerWebhookUrlsForBusiness(payment.order.business.internalPartnerWebhookUrl);
    if (urls.length === 0) {
      continue;
    }

    const body = {
      event: "payment.cancelled" as const,
      reason,
      businessId: payment.businessId,
      partnerProvisioningExternalUserId: payment.order.business.partnerProvisioningExternalUserId,
      partnerExternalBookingId: payment.order.partnerExternalBookingId,
      category: payment.order.partnerOrderCategory,
      orderId: payment.order.id,
      orderPublicCode: payment.order.publicCode,
      paymentId: payment.id,
      paymentPublicCode: payment.publicCode,
      paymentStatus: payment.status,
      occurredAt: new Date().toISOString(),
    };
    const bodyText = JSON.stringify(body);
    for (const url of urls) {
      await enqueuePartnerOutboundWebhookJob(url, bodyText);
    }
  }
}

export async function queueInternalPartnerPaymentFailed(
  paymentId: string,
  reason: string,
  detail?: string | null,
): Promise<void> {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      publicCode: true,
      status: true,
      businessId: true,
      orderId: true,
      order: {
        select: {
          id: true,
          publicCode: true,
          partnerExternalBookingId: true,
          partnerOrderCategory: true,
          business: {
            select: {
              partnerProvisioningExternalUserId: true,
              platformBillingWaived: true,
              internalPartnerWebhookUrl: true,
            },
          },
        },
      },
    },
  });
  if (!payment?.orderId || !payment.order?.partnerExternalBookingId?.trim()) {
    return;
  }
  if (!payment.order.business.platformBillingWaived) {
    return;
  }

  const urls = await partnerWebhookUrlsForBusiness(payment.order.business.internalPartnerWebhookUrl);
  if (urls.length === 0) {
    return;
  }

  const body = {
    event: "payment.failed" as const,
    reason,
    detail: detail ?? null,
    businessId: payment.businessId,
    partnerProvisioningExternalUserId: payment.order.business.partnerProvisioningExternalUserId,
    partnerExternalBookingId: payment.order.partnerExternalBookingId,
    category: payment.order.partnerOrderCategory,
    orderId: payment.order.id,
    orderPublicCode: payment.order.publicCode,
    paymentId: payment.id,
    paymentPublicCode: payment.publicCode,
    paymentStatus: payment.status,
    occurredAt: new Date().toISOString(),
  };
  const bodyText = JSON.stringify(body);
  for (const url of urls) {
    await enqueuePartnerOutboundWebhookJob(url, bodyText);
  }
}

export async function queueInternalPartnerSubscriptionUpdated(
  businessId: string,
): Promise<void> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      industry: true,
      partnerProvisioningExternalUserId: true,
      internalPartnerWebhookUrl: true,
      corporateBillingPlanId: true,
      corporateBillingInterval: true,
      corporateBillingPlan: true,
      subscriptions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          plan: { select: { code: true } },
          invoices: {
            where: { status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { guestToken: true },
          },
        },
      },
    },
  });
  if (!business?.partnerProvisioningExternalUserId?.trim()) {
    return;
  }

  const urls = await partnerWebhookUrlsForBusiness(business.internalPartnerWebhookUrl);
  if (urls.length === 0) {
    return;
  }

  const sub = business.subscriptions[0];
  const pendingGuestToken = sub?.invoices[0]?.guestToken ?? null;

  const body = {
    event: "subscription.updated" as const,
    businessId: business.id,
    partnerProvisioningExternalUserId: business.partnerProvisioningExternalUserId,
    status: sub?.status ?? null,
    planCode: sub?.plan.code ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
    pendingInvoiceGuestToken: pendingGuestToken,
    billing: formatPartnerBillingAssignment(business, sub?.billingInterval ?? null),
    occurredAt: new Date().toISOString(),
  };

  const bodyText = JSON.stringify(body);
  for (const url of urls) {
    await enqueuePartnerOutboundWebhookJob(url, bodyText);
  }
}

async function sendPartnerOutboundWebhookOnce(
  webhookUrl: string,
  bodyText: string,
): Promise<{ ok: boolean; httpStatus: number | null; error: string | null }> {
  const secret = await partnerWebhookSigningSecretForUrl(webhookUrl);
  if (!secret) {
    return {
      ok: false,
      httpStatus: null,
      error:
        "No signing secret for this webhook URL (configure under Platform → Security → Partnership config, or env INTERNAL_PARTNER_WEBHOOK_SECRET / matching URL pair)",
    };
  }
  const signature = crypto.createHmac("sha256", secret).update(bodyText).digest("hex");
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Easypay-Signature": `sha256=${signature}`,
      },
      body: bodyText,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, httpStatus: res.status, error: text.slice(0, 2000) };
    }
    return { ok: true, httpStatus: res.status, error: null };
  } catch (e) {
    return {
      ok: false,
      httpStatus: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export async function processPartnerOutboundWebhookJobs(limit = 25): Promise<number> {
  const now = new Date();
  const jobs = await prisma.partnerOutboundWebhookJob.findMany({
    where: {
      status: PartnerOutboundWebhookJobStatus.PENDING,
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  let touched = 0;
  for (const job of jobs) {
    touched += 1;
    const attemptNumber = job.attempts + 1;
    const send = await sendPartnerOutboundWebhookOnce(job.webhookUrl, job.bodyText);

    if (send.ok) {
      await prisma.partnerOutboundWebhookJob.update({
        where: { id: job.id },
        data: {
          status: PartnerOutboundWebhookJobStatus.SUCCEEDED,
          attempts: attemptNumber,
          lastHttpStatus: send.httpStatus,
          lastError: null,
        },
      });
      continue;
    }

    const abandoned = attemptNumber >= job.maxAttempts;
    const backoffIdx = Math.min(Math.max(attemptNumber - 1, 0), BACKOFF_MS.length - 1);
    const backoffMs = BACKOFF_MS[backoffIdx] ?? 60_000;
    const nextAttemptAt = abandoned ? job.nextAttemptAt : new Date(Date.now() + backoffMs);

    await prisma.partnerOutboundWebhookJob.update({
      where: { id: job.id },
      data: {
        status: abandoned
          ? PartnerOutboundWebhookJobStatus.ABANDONED
          : PartnerOutboundWebhookJobStatus.PENDING,
        attempts: attemptNumber,
        nextAttemptAt: nextAttemptAt,
        lastHttpStatus: send.httpStatus,
        lastError: send.error,
      },
    });

    if (abandoned) {
      console.warn(
        "[internal-partner] Webhook job abandoned after max attempts:",
        job.id,
        job.webhookUrl.slice(0, 96),
      );
    }
  }

  return touched;
}

export function startPartnerOutboundWebhookWorker(): void {
  if (workerStarted) {
    return;
  }
  workerStarted = true;
  const raw = Number(process.env.INTERNAL_PARTNER_WEBHOOK_WORKER_MS ?? "20000");
  const ms = Number.isFinite(raw) && raw >= 5000 ? raw : 20_000;
  void processPartnerOutboundWebhookJobs(25).catch((err) => {
    console.error("[internal-partner] Webhook worker initial run error:", err);
  });
  setInterval(() => {
    void processPartnerOutboundWebhookJobs(25).catch((err) => {
      console.error("[internal-partner] Webhook worker error:", err);
    });
  }, ms);
}
