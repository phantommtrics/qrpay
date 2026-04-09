import {
  JournalSourceType,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  SalesLedgerDirection,
  SalesLedgerEntryType,
  SalesLedgerStatus,
} from "@prisma/client";

import {
  CHART_CODE_CASH_ON_HAND,
  CHART_CODE_MERCHANT_WALLET_CLEARING,
  CHART_CODE_QR_WALLET_PROCESSING_FEES,
  CHART_CODE_SALES,
  ensureDefaultChartOfAccountsForBusiness,
  getChartAccountByCode,
} from "./chart-of-accounts.service.js";
import {
  CHECKOUT_ADAPTER_WAVE_GAMBIA,
  CHECKOUT_ADAPTER_YONNA_WALLET,
} from "./payment-gateway.service.js";
import {
  getDecryptedGatewaySecrets,
  type WaveGatewaySecrets,
  type YonnaGatewaySecrets,
} from "./business-gateway-credential.service.js";
import { customerWalletFeeRateFromGatewaySecrets } from "./merchant-pos-wallet-fee-resolution.service.js";

function providerLabel(provider: PaymentProvider): string {
  if (provider === PaymentProvider.UPFRONT_PAY) {
    return "upfront pay";
  }
  return String(provider).toLowerCase().replace(/_/g, " ");
}

/**
 * Normalise DB/Prisma enum values so recognition does not depend on reference equality quirks.
 */
function paymentMethodKey(method: PaymentMethod | string): string {
  return String(method).trim().toUpperCase();
}

function paymentProviderKey(provider: PaymentProvider | string): string {
  return String(provider).trim().toUpperCase();
}

/**
 * When `Payment.gatewayCode` is null (legacy rows or unusual flows), infer the gateway used for
 * Wave/Yonna wallet checkout if the business has exactly one credential for that adapter.
 */
async function resolveGatewayCodeForMerchantWalletFee(
  tx: Prisma.TransactionClient,
  businessId: string,
  provider: PaymentProvider,
): Promise<string | null> {
  const pk = paymentProviderKey(provider);
  const adapter =
    pk === paymentProviderKey(PaymentProvider.WAVE_GAMBIA)
      ? CHECKOUT_ADAPTER_WAVE_GAMBIA
      : pk === paymentProviderKey(PaymentProvider.YONNA_WALLET)
        ? CHECKOUT_ADAPTER_YONNA_WALLET
        : null;
  if (!adapter) {
    return null;
  }

  const rows = await tx.businessGatewayCredential.findMany({
    where: { businessId },
    include: { gateway: true },
  });
  const matches = rows.filter((r) => (r.gateway.checkoutAdapter || "").trim() === adapter);
  if (matches.length !== 1) {
    return null;
  }
  return matches[0]?.gateway.code ?? null;
}

function isPaymentCompleted(status: PaymentStatus | string): boolean {
  const k = String(status).trim().toUpperCase();
  return status === PaymentStatus.COMPLETED || k === "COMPLETED";
}

/**
 * **Cash on hand** (till / counter) — all must hold:
 * - `status` COMPLETED
 * - `method` CASH (never QR_WALLET)
 * - `provider` UPFRONT_PAY (POS “Cash” / counter path in this app)
 *
 * Everything else (wallet / simulator / Wave / Yonna, pending, etc.) posts to **digital clearing**.
 */
function usesCashOnHandLedger(input: CustomerSaleJournalInput): boolean {
  if (!isPaymentCompleted(input.status)) return false;
  if (paymentMethodKey(input.method) !== paymentMethodKey(PaymentMethod.CASH)) return false;
  return paymentProviderKey(input.provider) === paymentProviderKey(PaymentProvider.UPFRONT_PAY);
}

function paymentMethodLabel(input: CustomerSaleJournalInput): string {
  return usesCashOnHandLedger(input) ? "cash" : "qr_wallet";
}

function paymentMethodDisplay(input: CustomerSaleJournalInput): string {
  return usesCashOnHandLedger(input) ? "Cash" : "Digital wallet / QR";
}

/**
 * Customer sale accounting (per successful payment)
 * ================================================
 * Recognition: **Revenue is recognised when payment is received** (cash basis at
 * point of sale), which matches typical retail / POS practice for this product.
 *
 * **Counter cash** — `COMPLETED` + `method CASH` + `provider UPFRONT_PAY` → Dr Cash on hand · Cr Sales revenue  
 * Funds are in the till; this matches the POS/Orders “Cash” payment action.
 *
 * **QR wallet / card rails** — Dr Digital payments clearing · Cr Sales revenue  
 * Represents proceeds pending bank / provider settlement; accountants can later
 * journal Dr Bank · Cr Digital payments clearing when statements are reconciled.
 *
 * **Wave/Yonna wallet fee (optional)** — After the sale journal, {@link recordMerchantCustomerWalletFeeJournalAndLedger}
 * posts Dr QR wallet processing fees · Cr Digital clearing for the rate in encrypted gateway credentials (by
 * `gatewayCode`, or inferred when the business has a single Wave/Yonna checkout gateway).
 *
 * Idempotent per payment via `SalesLedgerEntry` unique (`paymentId`, `type`).
 */
export type CustomerSaleJournalInput = {
  businessId: string;
  orderId: string;
  /** Human-readable order ref (e.g. public code). */
  orderPublicCode: string;
  paymentId: string;
  /** Internal payment document ref (business payment public code). */
  paymentPublicCode: string;
  amount: Prisma.Decimal;
  currency: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  /** Must be COMPLETED; journals are not posted for pending/failed payments. */
  status: PaymentStatus;
  providerRef: string;
  /** Payment row gateway code — used to load wallet fee % from encrypted gateway credentials. */
  gatewayCode?: string | null;
};

function buildJournalHeaderMemo(input: CustomerSaleJournalInput): string {
  const method = paymentMethodDisplay(input);
  const prov = providerLabel(input.provider);
  return [
    `Customer sale — Order ${input.orderPublicCode}`,
    `Payment ${input.paymentPublicCode} · ${method} (${prov})`,
    `Provider ref: ${input.providerRef}`,
    `${input.currency} ${input.amount.toString()}`,
  ].join(" | ");
}

function debitAccountCodeForSale(input: CustomerSaleJournalInput): string {
  return usesCashOnHandLedger(input)
    ? CHART_CODE_CASH_ON_HAND
    : CHART_CODE_MERCHANT_WALLET_CLEARING;
}

function debitLineDescription(input: CustomerSaleJournalInput): string {
  if (usesCashOnHandLedger(input)) {
    return [
      "Debit — Cash on hand: counter/POS collection received.",
      `Order ${input.orderPublicCode}; payment ${input.paymentPublicCode}.`,
      "Asset increased; physical or immediate cash control.",
    ].join(" ");
  }
  return [
    "Debit — Digital payments clearing: wallet/card proceeds (in transit to bank).",
    `Order ${input.orderPublicCode}; payment ${input.paymentPublicCode}.`,
    "Asset increased; reconcile to settlement / bank when provider pays out.",
  ].join(" ");
}

function creditLineDescription(input: CustomerSaleJournalInput): string {
  return [
    "Credit — Sales revenue: retail sale recognised on payment received.",
    `Order ${input.orderPublicCode}; ${paymentMethodDisplay(input)}.`,
    "Revenue (P&L); matches cash-basis recognition at checkout.",
  ].join(" ");
}

export async function recordCustomerSaleJournalAndLedger(
  tx: Prisma.TransactionClient,
  input: CustomerSaleJournalInput,
): Promise<void> {
  const existing = await tx.salesLedgerEntry.findFirst({
    where: {
      paymentId: input.paymentId,
      type: SalesLedgerEntryType.CUSTOMER_SALE,
    },
  });
  if (existing) {
    return;
  }

  if (!isPaymentCompleted(input.status)) {
    throw new Error(
      "Customer sale journal requires payment status COMPLETED (cash: CASH + UPFRONT_PAY; wallet: QR_WALLET + provider).",
    );
  }

  await ensureDefaultChartOfAccountsForBusiness(tx, input.businessId);

  const debitCode = debitAccountCodeForSale(input);
  const debitAccount = await getChartAccountByCode(tx, input.businessId, debitCode);
  let sales = await getChartAccountByCode(tx, input.businessId, CHART_CODE_SALES);
  if (!sales) {
    sales = await getChartAccountByCode(tx, input.businessId, "SALES");
  }
  if (!debitAccount || !sales) {
    throw new Error("Default chart of accounts missing after ensure.");
  }

  const memo = buildJournalHeaderMemo(input);

  const journal = await tx.journalEntry.create({
    data: {
      businessId: input.businessId,
      memo,
      sourceType: JournalSourceType.CUSTOMER_SALE_PAYMENT,
      sourceId: input.paymentId,
      journalApprovalExempt: true,
      lines: {
        create: [
          {
            chartOfAccountId: debitAccount.id,
            debitAmount: input.amount,
            creditAmount: new Prisma.Decimal(0),
            description: debitLineDescription(input),
          },
          {
            chartOfAccountId: sales.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: input.amount,
            description: creditLineDescription(input),
          },
        ],
      },
    },
  });

  await tx.salesLedgerEntry.create({
    data: {
      businessId: input.businessId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      journalEntryId: journal.id,
      type: SalesLedgerEntryType.CUSTOMER_SALE,
      direction: SalesLedgerDirection.MONEY_IN,
      status: SalesLedgerStatus.SUCCEEDED,
      amount: input.amount,
      currency: input.currency,
      provider: providerLabel(input.provider),
      providerPaymentRef: input.providerRef,
      metadata: {
        method: paymentMethodLabel(input),
        paymentStatus: paymentMethodKey(input.status),
        paymentMethodRaw: paymentMethodKey(input.method),
        paymentProviderRaw: paymentProviderKey(input.provider),
        debitRecognition: usesCashOnHandLedger(input) ? "cash_on_hand" : "digital_clearing",
        orderPublicCode: input.orderPublicCode,
        paymentPublicCode: input.paymentPublicCode,
        debitAccountCode: debitCode,
        creditAccountCode: sales.code,
        recognitionBasis:
          "Revenue recognised when payment is received (cash basis at point of sale).",
        journalMemo: memo,
      },
    },
  });
}

/**
 * Estimated Wave/Yonna wallet fee on a completed customer QR payment (orders/POS).
 * Rate comes from `customerWalletFeeRate` in encrypted gateway credentials for `gatewayCode` (or inferred gateway).
 * No-op for simulator/cash/other providers, missing credentials, zero rate, or ambiguous multiple gateways.
 */
export async function recordMerchantCustomerWalletFeeJournalAndLedger(
  tx: Prisma.TransactionClient,
  input: CustomerSaleJournalInput,
): Promise<void> {
  if (!isPaymentCompleted(input.status)) {
    return;
  }
  if (paymentMethodKey(input.method) !== paymentMethodKey(PaymentMethod.QR_WALLET)) {
    return;
  }
  const pk = paymentProviderKey(input.provider);
  if (
    pk !== paymentProviderKey(PaymentProvider.WAVE_GAMBIA) &&
    pk !== paymentProviderKey(PaymentProvider.YONNA_WALLET)
  ) {
    return;
  }

  let gatewayCode = input.gatewayCode?.trim() || null;
  if (!gatewayCode) {
    gatewayCode = await resolveGatewayCodeForMerchantWalletFee(tx, input.businessId, input.provider);
  }
  if (!gatewayCode) {
    return;
  }

  const existingFee = await tx.salesLedgerEntry.findFirst({
    where: {
      paymentId: input.paymentId,
      type: SalesLedgerEntryType.WALLET_FEE,
    },
  });
  if (existingFee) {
    return;
  }

  const secrets = await getDecryptedGatewaySecrets<WaveGatewaySecrets | YonnaGatewaySecrets>(
    input.businessId,
    gatewayCode,
  );
  const rate = customerWalletFeeRateFromGatewaySecrets(secrets);
  const fee = new Prisma.Decimal(input.amount.toString()).mul(rate).toDecimalPlaces(2);
  if (fee.lte(0)) {
    return;
  }

  await ensureDefaultChartOfAccountsForBusiness(tx, input.businessId);

  const expenseAcct = await getChartAccountByCode(tx, input.businessId, CHART_CODE_QR_WALLET_PROCESSING_FEES);
  const clearingAcct = await getChartAccountByCode(tx, input.businessId, CHART_CODE_MERCHANT_WALLET_CLEARING);
  if (!expenseAcct || !clearingAcct) {
    throw new Error("Chart accounts missing for QR wallet fee posting.");
  }

  const memo = [
    `Wallet processing fee (est.) — Order ${input.orderPublicCode}`,
    `Payment ${input.paymentPublicCode} · ${providerLabel(input.provider)}`,
    `${input.currency} ${fee.toString()} (rate ${rate.toString()} × gross ${input.amount.toString()})`,
  ].join(" | ");

  const journal = await tx.journalEntry.create({
    data: {
      businessId: input.businessId,
      memo,
      sourceType: JournalSourceType.CUSTOMER_SALE_WALLET_FEE,
      sourceId: input.paymentId,
      journalApprovalExempt: true,
      lines: {
        create: [
          {
            chartOfAccountId: expenseAcct.id,
            debitAmount: fee,
            creditAmount: new Prisma.Decimal(0),
            description: `Estimated wallet/QR processing fee — payment ${input.paymentPublicCode}`,
          },
          {
            chartOfAccountId: clearingAcct.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: fee,
            description: "Reduce digital payments clearing by estimated provider fee",
          },
        ],
      },
    },
  });

  await tx.salesLedgerEntry.create({
    data: {
      businessId: input.businessId,
      orderId: input.orderId,
      paymentId: input.paymentId,
      journalEntryId: journal.id,
      type: SalesLedgerEntryType.WALLET_FEE,
      direction: SalesLedgerDirection.MONEY_OUT,
      status: SalesLedgerStatus.SUCCEEDED,
      amount: fee,
      currency: input.currency,
      provider: providerLabel(input.provider),
      providerPaymentRef: input.providerRef,
      metadata: {
        feeBasis: "payment_gross",
        rate: rate.toString(),
        orderPublicCode: input.orderPublicCode,
        paymentPublicCode: input.paymentPublicCode,
        debitAccountCode: expenseAcct.code,
        creditAccountCode: clearingAcct.code,
      },
    },
  });
}
