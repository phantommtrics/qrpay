/**
 * Reverse platform GL for subscription invoices paid via Dev Pay (`internal_dev`).
 *
 * Those test payments post: Dr P-1000 Subscription collections clearing · Cr P-4000 revenue.
 * This script posts a reversing journal (and optionally voids the invoice + cancels the ledger).
 *
 * Usage (from backend/):
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts --apply
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts --apply --revert-invoices
 *
 * Flags:
 *   --apply             Write reversing journals (default is dry-run)
 *   --revert-invoices   Also VOID paid invoices and CANCEL succeeded internal_dev ledgers
 *   --provider=X        Override provider filter (default: internal_dev)
 */
import "dotenv/config";
import {
  BillingLedgerEntryType,
  BillingLedgerStatus,
  InvoiceStatus,
  PlatformJournalSourceType,
  Prisma,
  PrismaClient,
} from "@prisma/client";

import { PLATFORM_CHART_SUBSCRIPTION_CLEARING } from "../src/services/platform-chart-of-accounts.service.js";

const prisma = new PrismaClient();

const DEV_PAY_PROVIDER_DEFAULT = "internal_dev";
const DEV_PAY_IDEMPOTENCY_PREFIX = "dev-pay:";

type Args = {
  apply: boolean;
  revertInvoices: boolean;
  provider: string;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let revertInvoices = false;
  let provider = DEV_PAY_PROVIDER_DEFAULT;
  for (const raw of argv) {
    if (raw === "--apply") apply = true;
    else if (raw === "--revert-invoices") revertInvoices = true;
    else if (raw.startsWith("--provider=")) {
      const v = raw.slice("--provider=".length).trim();
      if (v) provider = v;
    }
  }
  return { apply, revertInvoices, provider };
}

function money(n: Prisma.Decimal | number): string {
  return Number(n).toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[dev-pay-clearing] mode=${args.apply ? "APPLY" : "DRY-RUN"} provider=${args.provider} revertInvoices=${args.revertInvoices}`,
  );

  const clearing = await prisma.platformChartOfAccount.findUnique({
    where: { code: PLATFORM_CHART_SUBSCRIPTION_CLEARING },
    select: { id: true, code: true, name: true },
  });
  if (!clearing) {
    throw new Error(
      `Platform chart account ${PLATFORM_CHART_SUBSCRIPTION_CLEARING} (Subscription collections clearing) not found.`,
    );
  }

  const ledgers = await prisma.billingLedgerEntry.findMany({
    where: {
      type: BillingLedgerEntryType.INVOICE_PAYMENT,
      status: BillingLedgerStatus.SUCCEEDED,
      OR: [
        { provider: args.provider },
        { idempotencyKey: { startsWith: DEV_PAY_IDEMPOTENCY_PREFIX } },
      ],
    },
    include: {
      subscriptionInvoice: {
        select: {
          id: true,
          status: true,
          amount: true,
          currency: true,
          paidAt: true,
          business: { select: { id: true, name: true, slug: true } },
          plan: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: [{ succeededAt: "asc" }, { createdAt: "asc" }],
  });

  if (ledgers.length === 0) {
    console.log("[dev-pay-clearing] No matching Dev Pay billing ledger rows found.");
    return;
  }

  console.log(`[dev-pay-clearing] Found ${ledgers.length} succeeded Dev Pay payment ledger(s).\n`);

  let reverseCount = 0;
  let skipAlreadyReversed = 0;
  let skipNoJournal = 0;
  let skipNoClearingLine = 0;
  let invoiceVoidCount = 0;
  let ledgerCancelCount = 0;
  let clearingDebitTotal = new Prisma.Decimal(0);

  for (const ledger of ledgers) {
    const invoice = ledger.subscriptionInvoice;
    if (!invoice) {
      console.log(`- ledger ${ledger.id}: skip (no linked invoice)`);
      skipNoJournal += 1;
      continue;
    }

    const journal = await prisma.platformJournalEntry.findFirst({
      where: {
        sourceType: PlatformJournalSourceType.SUBSCRIPTION_INVOICE_PAYMENT,
        sourceId: invoice.id,
        reversesPlatformJournalEntryId: null,
      },
      include: {
        lines: {
          include: { chartOfAccount: { select: { code: true, name: true } } },
        },
        reversedByPlatformEntry: { select: { id: true } },
      },
    });

    const biz = invoice.business.name;
    const plan = invoice.plan.name;
    const header = `${biz} · ${plan} · invoice ${invoice.id.slice(0, 8)}… · ${money(invoice.amount)} ${invoice.currency}`;

    if (!journal) {
      console.log(`- ${header}: no SUBSCRIPTION_INVOICE_PAYMENT journal (already cleaned?)`);
      skipNoJournal += 1;
      continue;
    }

    if (journal.reversedByPlatformEntry) {
      console.log(
        `- ${header}: already reversed by ${journal.reversedByPlatformEntry.id.slice(0, 8)}…`,
      );
      skipAlreadyReversed += 1;
      continue;
    }

    const clearingLine = journal.lines.find(
      (ln) => ln.chartOfAccount.code === PLATFORM_CHART_SUBSCRIPTION_CLEARING,
    );
    if (!clearingLine || Number(clearingLine.debitAmount) <= 0) {
      console.log(
        `- ${header}: journal ${journal.id.slice(0, 8)}… has no debit on ${PLATFORM_CHART_SUBSCRIPTION_CLEARING}`,
      );
      skipNoClearingLine += 1;
      continue;
    }

    clearingDebitTotal = clearingDebitTotal.add(clearingLine.debitAmount);
    console.log(
      `- ${header}: will reverse journal ${journal.id} (clearing Dr ${money(clearingLine.debitAmount)})`,
    );

    if (!args.apply) {
      reverseCount += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const locked = await tx.platformJournalEntry.findUnique({
        where: { id: journal.id },
        include: {
          lines: { orderBy: { id: "asc" } },
          reversedByPlatformEntry: { select: { id: true } },
        },
      });
      if (!locked || locked.reversedByPlatformEntry) {
        return;
      }

      await tx.platformJournalEntry.create({
        data: {
          postedAt: new Date(),
          memo: `Dev Pay cleanup — reverse test subscription clearing (${args.provider}). Original: ${locked.memo ?? locked.id}`,
          reference: locked.reference,
          sourceType: PlatformJournalSourceType.MANUAL_JOURNAL_REVERSAL,
          sourceId: locked.id,
          businessId: locked.businessId,
          reversesPlatformJournalEntryId: locked.id,
          lines: {
            create: locked.lines.map((ln) => ({
              chartOfAccountId: ln.chartOfAccountId,
              debitAmount: ln.creditAmount,
              creditAmount: ln.debitAmount,
              description: ln.description?.trim()
                ? `Reversal (dev-pay cleanup): ${ln.description.trim()}`
                : "Reversal (dev-pay cleanup)",
              quantity: ln.quantity,
              unitLabel: ln.unitLabel,
              taxAmount: ln.taxAmount,
            })),
          },
        },
      });

      if (args.revertInvoices) {
        if (invoice.status === InvoiceStatus.PAID) {
          await tx.subscriptionInvoice.update({
            where: { id: invoice.id },
            data: {
              status: InvoiceStatus.VOID,
              paidAt: null,
            },
          });
          invoiceVoidCount += 1;
        }
        if (ledger.status === BillingLedgerStatus.SUCCEEDED) {
          await tx.billingLedgerEntry.update({
            where: { id: ledger.id },
            data: { status: BillingLedgerStatus.CANCELLED },
          });
          ledgerCancelCount += 1;
        }
      }
    });

    reverseCount += 1;
  }

  console.log("\n[dev-pay-clearing] Summary");
  console.log(`  journals to reverse / reversed: ${reverseCount}`);
  console.log(`  clearing debit total:           ${money(clearingDebitTotal)} (${clearing.name})`);
  console.log(`  skipped already reversed:       ${skipAlreadyReversed}`);
  console.log(`  skipped no journal:             ${skipNoJournal}`);
  console.log(`  skipped no clearing debit:      ${skipNoClearingLine}`);
  if (args.apply && args.revertInvoices) {
    console.log(`  invoices voided:                ${invoiceVoidCount}`);
    console.log(`  ledgers cancelled:              ${ledgerCancelCount}`);
  }
  if (!args.apply) {
    console.log("\nDry-run only. Re-run with --apply to post reversing journals.");
    console.log("Add --revert-invoices with --apply to VOID invoices and CANCEL ledgers.");
    console.log(
      "Note: subscription ACTIVE status is left unchanged — review those tenants separately if needed.",
    );
  } else {
    console.log("\nDone. Refresh platform accounting / dashboard to confirm clearing balance.");
  }
}

main()
  .catch((err) => {
    console.error("[dev-pay-clearing] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
