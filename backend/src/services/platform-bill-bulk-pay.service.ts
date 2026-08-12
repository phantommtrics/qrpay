import { BillStatus, Prisma } from "@prisma/client";

import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import {
  apsWalletGetTransaction,
  apsWalletSendPayment,
  normalizeApsCustomerMobile,
} from "./aps-wallet-client.service.js";
import { markPlatformBillPaid } from "./platform-bill.service.js";
import {
  CHECKOUT_ADAPTER_APS_WALLET,
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  getPaymentGatewayByCode,
} from "./payment-gateway.service.js";
import { listSubscriptionInvoiceCheckoutWallets } from "./subscription-invoice-checkout.service.js";
import {
  isPlatformWaveCheckoutConfigured,
  waveServiceFromEnv,
} from "./wave-client-env.js";
import { normalizeWaveMobile, sendWavePayoutForBill } from "./wave-ops.service.js";

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

export async function listPlatformBillBulkPostGateways() {
  return listSubscriptionInvoiceCheckoutWallets();
}

export async function previewPlatformBillBulkPost(input: {
  billIds: string[];
  gatewayCode?: string;
}) {
  const ids = [...new Set(input.billIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) {
    throw new HttpError(400, "Select at least one bill.");
  }

  const bills = await prisma.platformBill.findMany({
    where: { id: { in: ids } },
    include: {
      supplier: { select: { id: true, name: true, email: true, phone: true } },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });

  let waveCurrency: string | null = null;
  let isWaveGateway = false;
  const code = input.gatewayCode?.trim().toLowerCase();
  if (code) {
    const gateway = await getPaymentGatewayByCode(code);
    if (gateway?.checkoutAdapter === CHECKOUT_ADAPTER_WAVE_GAMBIA) {
      isWaveGateway = true;
      if (isPlatformWaveCheckoutConfigured()) {
        try {
          const balance = await waveServiceFromEnv().getBalance();
          waveCurrency = balance.currency;
        } catch {
          waveCurrency = null;
        }
      }
    }
  }

  const byId = new Map(bills.map((b) => [b.id, b]));
  const items = ids.map((billId) => {
    const bill = byId.get(billId);
    if (!bill) {
      return {
        billId,
        publicCode: null as string | null,
        supplierId: null as string | null,
        supplierName: null as string | null,
        supplierPhone: null as string | null,
        supplierPhoneNormalized: null as string | null,
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
    if (bill.platformJournalEntryId) {
      warnings.push("Bill is already posted to the ledger.");
    }
    if (!bill.lines.length) {
      warnings.push("Bill has no lines.");
    }

    const phoneRaw = bill.supplier.phone?.trim() || null;
    const phoneNormalizedAps = phoneRaw ? normalizeApsCustomerMobile(phoneRaw) : null;
    const phoneNormalizedWave = phoneRaw ? normalizeWaveMobile(phoneRaw) : null;
    const phoneNormalized = isWaveGateway ? phoneNormalizedWave : phoneNormalizedAps;

    if (!phoneNormalized) {
      warnings.push(
        isWaveGateway
          ? "Supplier mobile number is required for Wave payout (international format, e.g. +220…)."
          : "Supplier mobile number is required for APS wallet send.",
      );
    }

    if (isWaveGateway && !isPlatformWaveCheckoutConfigured()) {
      warnings.push("Wave is not configured (WAVE_CHECKOUT_BEARER).");
    }

    if (waveCurrency && bill.currency.toUpperCase() !== waveCurrency.toUpperCase()) {
      warnings.push(
        `Bill currency ${bill.currency} does not match Wave wallet currency ${waveCurrency}.`,
      );
    }

    const narrations = bill.lines
      .map((l) => l.narration?.trim() || "Line")
      .filter(Boolean);

    return {
      billId: bill.id,
      publicCode: bill.publicCode,
      supplierId: bill.supplier.id,
      supplierName: bill.supplier.name,
      supplierPhone: phoneRaw,
      supplierPhoneNormalized: phoneNormalized,
      amount: billTotal(bill.lines),
      currency: bill.currency,
      narrations,
      warnings,
      eligible: warnings.length === 0,
    };
  });

  const gateways = await listPlatformBillBulkPostGateways();

  return { items, gateways, waveCurrency };
}

export type PlatformBillBulkPostResult = {
  billId: string;
  success: boolean;
  publicCode?: string | null;
  supplierName?: string | null;
  amount?: number | null;
  currency?: string | null;
  supplierPhone?: string | null;
  error?: string;
  errorPhase?: "validation" | "aps_send" | "wave_send" | "ledger";
  transactionId?: string;
};

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof Error && e.message.trim()) return e.message.trim();
  return fallback;
}

export async function executePlatformBillBulkPost(input: {
  billIds: string[];
  gatewayCode: string;
  settlementChartAccountId: string;
  postedAt: Date;
}): Promise<{ results: PlatformBillBulkPostResult[] }> {
  const code = input.gatewayCode.trim().toLowerCase();
  const gateway = await getPaymentGatewayByCode(code);
  if (!gateway || !gateway.isEnabled) {
    throw new HttpError(400, "This payment gateway is not available.");
  }

  const wallets = await listPlatformBillBulkPostGateways();
  const wallet = wallets.find((w) => w.code === code);
  if (!wallet) {
    throw new HttpError(400, "This payment gateway is not configured for platform checkout.");
  }

  const adapter = gateway.checkoutAdapter?.trim() || "";
  const isAps = adapter === CHECKOUT_ADAPTER_APS_WALLET;
  const isWave = adapter === CHECKOUT_ADAPTER_WAVE_GAMBIA;

  const preview = await previewPlatformBillBulkPost({
    billIds: input.billIds,
    gatewayCode: code,
  });
  const results: PlatformBillBulkPostResult[] = [];

  for (const item of preview.items) {
    const resultBase = {
      billId: item.billId,
      publicCode: item.publicCode,
      supplierName: item.supplierName,
      amount: item.amount,
      currency: item.currency,
      supplierPhone: item.supplierPhone,
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

    if (isAps) {
      const mobile = item.supplierPhoneNormalized;
      if (!mobile) {
        results.push({
          ...resultBase,
          success: false,
          errorPhase: "validation",
          error: "Supplier mobile number is required for APS wallet send.",
        });
        continue;
      }
      const amountStr = item.amount.toFixed(2);
      try {
        const send = await apsWalletSendPayment(mobile, amountStr, { scope: "platform_env" });
        transactionId = send.reference;
        if (transactionId) {
          try {
            await apsWalletGetTransaction(transactionId, { scope: "platform_env" });
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
    } else if (isWave) {
      const mobile = item.supplierPhoneNormalized;
      if (!mobile || !item.supplierId || !item.currency) {
        results.push({
          ...resultBase,
          success: false,
          errorPhase: "validation",
          error: "Supplier mobile number is required for Wave payout.",
        });
        continue;
      }
      try {
        const send = await sendWavePayoutForBill({
          supplierId: item.supplierId,
          supplierName: item.supplierName || "Supplier",
          mobile,
          receiveAmount: item.amount.toFixed(2),
          currency: item.currency,
          platformBillId: item.billId,
          clientReference: item.publicCode || undefined,
        });
        transactionId = send.wavePayoutId;
      } catch (e) {
        results.push({
          ...resultBase,
          success: false,
          errorPhase: "wave_send",
          error: errorMessage(
            e,
            "Wave could not send the payout. Check the mobile number, balance, and try again.",
          ),
        });
        continue;
      }
    }

    try {
      await markPlatformBillPaid(item.billId, {
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
          isAps || isWave
            ? "Money was sent but the bill could not be posted to the ledger. Contact support before retrying."
            : "Could not post the bill to the ledger.",
        ),
      });
    }
  }

  return { results };
}
