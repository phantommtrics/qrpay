import { BillStatus, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  apsWalletGetTransaction,
  apsWalletSendPayment,
  normalizeApsCustomerMobile,
} from "./aps-wallet-client.service.js";
import { markBillPaid } from "./bill.service.js";
import { resolveApsWalletMerchantContextForBusiness } from "./order-aps-wallet-checkout.service.js";
import { listOrderCheckoutWallets } from "./order-wallet-checkout.service.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  getPaymentGatewayByCode,
} from "./payment-gateway.service.js";

function lineTotal(line: {
  quantity: Prisma.Decimal;
  unitAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
}): number {
  const q = line.quantity;
  const u = line.unitAmount;
  const t = line.taxAmount ?? new Prisma.Decimal(0);
  return Number(q.mul(u).add(t).toFixed(2));
}

function billTotal(
  lines: Array<{
    quantity: Prisma.Decimal;
    unitAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
  }>,
): number {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export async function listMerchantBillBulkPostGateways(businessId: string) {
  return listOrderCheckoutWallets(businessId);
}

export async function previewMerchantBillBulkPost(input: {
  businessId: string;
  billIds: string[];
}) {
  const ids = [...new Set(input.billIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    throw new HttpError(400, "Select at least one bill.");
  }

  const bills = await prisma.bill.findMany({
    where: { businessId: input.businessId, id: { in: ids } },
    include: {
      contact: { select: { id: true, name: true, email: true, phone: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });

  const byId = new Map(bills.map((b) => [b.id, b]));
  const items = ids.map((billId) => {
    const bill = byId.get(billId);
    if (!bill) {
      return {
        billId,
        publicCode: null as string | null,
        contactName: null as string | null,
        contactPhone: null as string | null,
        contactPhoneNormalized: null as string | null,
        amount: null as number | null,
        currency: null as string | null,
        narrations: [] as string[],
        warnings: ["Bill not found."],
        eligible: false,
      };
    }

    const warnings: string[] = [];
    if (bill.status !== BillStatus.APPROVED) {
      warnings.push(`Bill status is ${bill.status}; only approved bills can be posted.`);
    }
    if (bill.journalEntryId) {
      warnings.push("Bill is already posted to the ledger.");
    }
    if (!bill.lines.length) {
      warnings.push("Bill has no lines.");
    }

    const phoneRaw = bill.contact.phone?.trim() || null;
    const phoneNormalized = phoneRaw ? normalizeApsCustomerMobile(phoneRaw) : null;
    if (!phoneNormalized) {
      warnings.push("Contact mobile number is required for APS wallet send.");
    }

    const narrations = bill.lines
      .map((l) => l.narration?.trim() || "Line")
      .filter(Boolean);

    return {
      billId: bill.id,
      publicCode: bill.publicCode,
      contactName: bill.contact.name,
      contactPhone: phoneRaw,
      contactPhoneNormalized: phoneNormalized,
      amount: billTotal(bill.lines),
      currency: bill.currency,
      narrations,
      warnings,
      eligible: warnings.length === 0,
    };
  });

  const gateways = await listMerchantBillBulkPostGateways(input.businessId);

  return { items, gateways };
}

export type MerchantBillBulkPostResult = {
  billId: string;
  success: boolean;
  publicCode?: string | null;
  contactName?: string | null;
  amount?: number | null;
  currency?: string | null;
  contactPhone?: string | null;
  error?: string;
  errorPhase?: "validation" | "aps_send" | "ledger";
  transactionId?: string;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

export async function executeMerchantBillBulkPost(input: {
  businessId: string;
  billIds: string[];
  gatewayCode: string;
  settlementChartAccountId: string;
  postedAt: Date;
}): Promise<{ results: MerchantBillBulkPostResult[] }> {
  const code = input.gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  const wallets = await listMerchantBillBulkPostGateways(input.businessId);
  const wallet = wallets.find((w) => w.code === code);
  if (!wallet) {
    throw new HttpError(
      400,
      "This payment gateway is not configured for checkout. Add credentials under Merchant API.",
    );
  }

  const adapter = gateway.checkoutAdapter?.trim() || "";
  const isAps = adapter === CHECKOUT_ADAPTER_APS_WALLET;

  const preview = await previewMerchantBillBulkPost({
    businessId: input.businessId,
    billIds: input.billIds,
  });
  const results: MerchantBillBulkPostResult[] = [];

  let merchantCtx: Awaited<ReturnType<typeof resolveApsWalletMerchantContextForBusiness>> | null =
    null;
  if (isAps) {
    merchantCtx = await resolveApsWalletMerchantContextForBusiness(input.businessId, code);
  }

  for (const item of preview.items) {
    const resultBase = {
      billId: item.billId,
      publicCode: item.publicCode,
      contactName: item.contactName,
      amount: item.amount,
      currency: item.currency,
      contactPhone: item.contactPhone,
    };

    if (!item.eligible || !item.amount || item.amount <= 0) {
      results.push({
        ...resultBase,
        success: false,
        errorPhase: "validation",
        error: item.warnings.join(" ") || "Bill is not eligible for bulk post.",
      });
      continue;
    }

    let transactionId: string | undefined;

    if (isAps && merchantCtx) {
      const mobile = item.contactPhoneNormalized;
      if (!mobile) {
        results.push({
          ...resultBase,
          success: false,
          errorPhase: "validation",
          error: "Contact mobile number is required for APS wallet send.",
        });
        continue;
      }
      const amountStr = item.amount.toFixed(2);
      try {
        const send = await apsWalletSendPayment(mobile, amountStr, merchantCtx);
        transactionId = send.reference;
        if (transactionId) {
          try {
            await apsWalletGetTransaction(transactionId, merchantCtx);
          } catch {
            // Non-fatal: send succeeded; detail lookup is best-effort.
          }
        }
      } catch (e) {
        results.push({
          ...resultBase,
          success: false,
          errorPhase: "aps_send",
          error: errorMessage(
            e,
            "APS Wallet could not send money. Check the mobile number, balance, and try again.",
          ),
        });
        continue;
      }
    }

    try {
      await markBillPaid(input.businessId, item.billId, {
        settlementChartAccountId: input.settlementChartAccountId,
        postedAt: input.postedAt,
        paymentGatewayCode: code,
        paymentProviderRef: transactionId ?? null,
      });

      results.push({
        ...resultBase,
        success: true,
        transactionId,
      });
    } catch (e) {
      results.push({
        ...resultBase,
        success: false,
        errorPhase: "ledger",
        error: errorMessage(
          e,
          isAps
            ? "Money was sent but the bill could not be posted to the ledger. Contact support before retrying."
            : "Could not post the bill to the ledger.",
        ),
      });
    }
  }

  return { results };
}
