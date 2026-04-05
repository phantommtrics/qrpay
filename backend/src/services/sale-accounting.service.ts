import {
  JournalSourceType,
  PaymentMethod,
  PaymentProvider,
  Prisma,
  SalesLedgerDirection,
  SalesLedgerEntryType,
  SalesLedgerStatus,
} from "@prisma/client";

import {
  CHART_CODE_MERCHANT_WALLET_CLEARING,
  CHART_CODE_SALES,
  ensureDefaultChartOfAccountsForBusiness,
  getChartAccountByCode,
} from "./chart-of-accounts.service.js";

function providerLabel(provider: PaymentProvider): string {
  return String(provider).toLowerCase();
}

function paymentMethodLabel(method: PaymentMethod): string {
  return method === PaymentMethod.CASH ? "cash" : "qr_wallet";
}

/**
 * Double-entry: debit merchant wallet clearing (asset), credit sales (revenue).
 * Idempotent per payment via unique paymentId on SalesLedgerEntry.
 */
export async function recordCustomerSaleJournalAndLedger(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    orderId: string;
    paymentId: string;
    amount: Prisma.Decimal;
    currency: string;
    provider: PaymentProvider;
    method: PaymentMethod;
    providerRef: string;
  },
): Promise<void> {
  const existing = await tx.salesLedgerEntry.findUnique({
    where: { paymentId: input.paymentId },
  });
  if (existing) {
    return;
  }

  await ensureDefaultChartOfAccountsForBusiness(tx, input.businessId);

  const clearing = await getChartAccountByCode(tx, input.businessId, CHART_CODE_MERCHANT_WALLET_CLEARING);
  const sales = await getChartAccountByCode(tx, input.businessId, CHART_CODE_SALES);
  if (!clearing || !sales) {
    throw new Error("Default chart of accounts missing after ensure.");
  }

  const memo = `Customer sale — ${paymentMethodLabel(input.method)} (${providerLabel(input.provider)})`;

  const journal = await tx.journalEntry.create({
    data: {
      businessId: input.businessId,
      memo,
      sourceType: JournalSourceType.CUSTOMER_SALE_PAYMENT,
      sourceId: input.paymentId,
      lines: {
        create: [
          {
            chartOfAccountId: clearing.id,
            debitAmount: input.amount,
            creditAmount: new Prisma.Decimal(0),
          },
          {
            chartOfAccountId: sales.id,
            debitAmount: new Prisma.Decimal(0),
            creditAmount: input.amount,
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
        method: paymentMethodLabel(input.method),
      },
    },
  });
}
