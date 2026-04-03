import {
  BillingLedgerDirection,
  BillingLedgerEntryType,
  BillingLedgerStatus,
  type Prisma,
} from "@prisma/client";

export async function cancelPendingInvoicePaymentLedgers(
  tx: Prisma.TransactionClient,
  subscriptionInvoiceId: string,
): Promise<void> {
  await tx.billingLedgerEntry.updateMany({
    where: {
      subscriptionInvoiceId,
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      status: BillingLedgerStatus.PENDING,
    },
    data: { status: BillingLedgerStatus.CANCELLED },
  });
}

export async function createPendingInvoicePaymentLedger(
  tx: Prisma.TransactionClient,
  input: {
    businessId: string;
    subscriptionId: string;
    subscriptionInvoiceId: string;
    amount: Prisma.Decimal;
    currency: string;
    provider: string;
    providerCheckoutSessionId: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.billingLedgerEntry.create({
    data: {
      businessId: input.businessId,
      subscriptionId: input.subscriptionId,
      subscriptionInvoiceId: input.subscriptionInvoiceId,
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      direction: BillingLedgerDirection.MONEY_IN,
      status: BillingLedgerStatus.PENDING,
      amount: input.amount,
      currency: input.currency,
      provider: input.provider,
      providerCheckoutSessionId: input.providerCheckoutSessionId,
      metadata: input.metadata ?? undefined,
    },
  });
}
