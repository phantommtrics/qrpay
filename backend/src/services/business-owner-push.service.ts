import webPush, { type PushSubscription } from "web-push";
import { randomBytes } from "node:crypto";
import { BusinessMembershipStatus, Prisma } from "@prisma/client";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";

const vapidConfigured = Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY);

type OwnerPushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function genPushSubscriptionId(): string {
  return `push_${randomBytes(16).toString("base64url")}`;
}

if (vapidConfigured) {
  webPush.setVapidDetails(
    env.WEB_PUSH_SUBJECT ?? "mailto:info@easy-pay.com",
    env.WEB_PUSH_PUBLIC_KEY!,
    env.WEB_PUSH_PRIVATE_KEY!,
  );
}

export function getWebPushPublicKey(): string | null {
  return env.WEB_PUSH_PUBLIC_KEY ?? null;
}

export async function upsertBusinessOwnerPushSubscription(input: {
  businessId: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}) {
  const owner = await prisma.businessMembership.findFirst({
    where: {
      businessId: input.businessId,
      userId: input.userId,
      isOwner: true,
      status: BusinessMembershipStatus.ACTIVE,
    },
    select: { id: true },
  });
  if (!owner) {
    return { saved: false as const };
  }

  await prisma.$executeRaw`
    INSERT INTO "businessOwnerPushSubscriptions"
      ("id", "businessId", "userId", "endpoint", "p256dh", "auth", "userAgent", "updatedAt")
    VALUES
      (${genPushSubscriptionId()}, ${input.businessId}, ${input.userId}, ${input.endpoint}, ${input.p256dh}, ${input.auth}, ${input.userAgent}, now())
    ON CONFLICT ("endpoint") DO UPDATE SET
      "businessId" = EXCLUDED."businessId",
      "userId" = EXCLUDED."userId",
      "p256dh" = EXCLUDED."p256dh",
      "auth" = EXCLUDED."auth",
      "userAgent" = EXCLUDED."userAgent",
      "updatedAt" = now(),
      "lastSeenAt" = now()
  `;

  return { saved: true as const };
}

export async function deleteBusinessOwnerPushSubscription(endpoint: string) {
  await prisma.$executeRaw`
    DELETE FROM "businessOwnerPushSubscriptions"
    WHERE "endpoint" = ${endpoint}
  `;
}

export async function notifyBusinessOwnersOfPayment(input: {
  businessId: string;
  orderPublicCode?: string | null;
  paymentPublicCode: string;
  amount: Prisma.Decimal | number | string;
  currency: string;
  methodLabel: string;
  receiptPublicCode?: string | null;
}) {
  if (!vapidConfigured) {
    return;
  }

  const subscriptions = await prisma.$queryRaw<OwnerPushSubscriptionRow[]>`
    SELECT s."endpoint", s."p256dh", s."auth"
    FROM "businessOwnerPushSubscriptions" s
    INNER JOIN "BusinessMembership" m
      ON m."businessId" = s."businessId"
      AND m."userId" = s."userId"
      AND m."isOwner" = true
      AND m."status" = ${BusinessMembershipStatus.ACTIVE}::"BusinessMembershipStatus"
    WHERE s."businessId" = ${input.businessId}
  `;
  if (subscriptions.length === 0) {
    return;
  }

  const amount = `${input.currency} ${Number(input.amount).toFixed(2)}`;
  const bodyParts = [
    `${input.methodLabel} payment received: ${amount}`,
    input.receiptPublicCode ? `Receipt ${input.receiptPublicCode}` : null,
    input.orderPublicCode ? `Order ${input.orderPublicCode}` : null,
  ].filter((part): part is string => Boolean(part));

  const payload = JSON.stringify({
    title: "Payment processed",
    body: bodyParts.join(" - "),
    icon: "/app_logo.png",
    badge: "/favicon-32x32.png",
    tag: `directpay-owner-payment-${input.paymentPublicCode}`,
    url: "/#/payments",
  });

  await Promise.all(
    subscriptions.map(async (row) => {
      const subscription: PushSubscription = {
        endpoint: row.endpoint,
        keys: {
          p256dh: row.p256dh,
          auth: row.auth,
        },
      };

      try {
        await webPush.sendNotification(subscription, payload);
      } catch (error) {
        const statusCode =
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          typeof (error as { statusCode: unknown }).statusCode === "number"
            ? (error as { statusCode: number }).statusCode
            : null;

        if (statusCode === 404 || statusCode === 410) {
          await prisma.$executeRaw`
            DELETE FROM "businessOwnerPushSubscriptions"
            WHERE "endpoint" = ${row.endpoint}
          `;
          return;
        }

        console.error("[web-push] Failed to send owner payment notification:", error);
      }
    }),
  );
}
