/**
 * Zero platform GL / billing ledger so operator books are clean for real admin collections.
 *
 * Scope (platform only — merchant journals, sales ledgers, and tenant CoA are never touched):
 *   1. Reverse every unreversed PlatformJournalEntry (balances → 0), or
 *   2. With --wipe: hard-delete all platform journals + billing ledger rows after clearing FKs.
 *
 * Optional: VOID paid subscription invoices tied to cancelled ledgers.
 *
 * Usage (from backend/):
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts --apply
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts --apply --revert-invoices
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts --apply --wipe
 *   npx tsx scripts/reverse-dev-pay-subscription-clearing.ts --dev-pay-only --apply --revert-invoices
 *
 * Flags:
 *   --apply             Write changes (default is dry-run)
 *   --wipe              Hard-delete platform journals + billing ledger (instead of reverse + cancel)
 *   --revert-invoices   VOID PAID invoices linked to ledgers being cleared (ignored with --wipe unless also set)
 *   --dev-pay-only      Limit to Dev Pay / internal_dev billing + subscription payment journals only
 *   --provider=X        Dev Pay provider filter when --dev-pay-only (default: internal_dev)
 */
import "dotenv/config";
import {
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

type MerchantLedgerCounts = {
  JournalEntry: number;
  JournalLine: number;
  ChartOfAccount: number;
  SalesLedgerEntry: number;
};

type Args = {
  apply: boolean;
  wipe: boolean;
  revertInvoices: boolean;
  devPayOnly: boolean;
  provider: string;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let wipe = false;
  let revertInvoices = false;
  let devPayOnly = false;
  let provider = DEV_PAY_PROVIDER_DEFAULT;
  for (const raw of argv) {
    if (raw === "--apply") apply = true;
    else if (raw === "--wipe") wipe = true;
    else if (raw === "--revert-invoices") revertInvoices = true;
    else if (raw === "--dev-pay-only") devPayOnly = true;
    else if (raw.startsWith("--provider=")) {
      const v = raw.slice("--provider=".length).trim();
      if (v) provider = v;
    }
  }
  return { apply, wipe, revertInvoices, devPayOnly, provider };
}

function money(n: Prisma.Decimal | number): string {
  return Number(n).toFixed(2);
}

async function assertMerchantLedgersUntouched(before: MerchantLedgerCounts) {
  const after = await countMerchantLedgerRows();
  for (const key of Object.keys(before) as Array<keyof MerchantLedgerCounts>) {
    if (after[key] !== before[key]) {
      throw new Error(
        `Safety abort: merchant table ${key} changed (${before[key]} → ${after[key]}). Inspect immediately.`,
      );
    }
  }
}

async function countMerchantLedgerRows(): Promise<MerchantLedgerCounts> {
  const [journalEntry, journalLine, chartOfAccount, salesLedgerEntry] = await Promise.all([
    prisma.journalEntry.count(),
    prisma.journalLine.count(),
    prisma.chartOfAccount.count(),
    prisma.salesLedgerEntry.count(),
  ]);
  return {
    JournalEntry: journalEntry,
    JournalLine: journalLine,
    ChartOfAccount: chartOfAccount,
    SalesLedgerEntry: salesLedgerEntry,
  };
}

async function platformAccountBalances(): Promise<
  Array<{ code: string; name: string; debit: Prisma.Decimal; credit: Prisma.Decimal; net: number }>
> {
  const lines = await prisma.platformJournalLine.groupBy({
    by: ["chartOfAccountId"],
    _sum: { debitAmount: true, creditAmount: true },
  });
  if (lines.length === 0) return [];
  const accounts = await prisma.platformChartOfAccount.findMany({
    where: { id: { in: lines.map((l) => l.chartOfAccountId) } },
    select: { id: true, code: true, name: true },
  });
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return lines
    .map((l) => {
      const acct = byId.get(l.chartOfAccountId);
      const debit = l._sum.debitAmount ?? new Prisma.Decimal(0);
      const credit = l._sum.creditAmount ?? new Prisma.Decimal(0);
      return {
        code: acct?.code ?? "?",
        name: acct?.name ?? "?",
        debit,
        credit,
        net: Number(debit.sub(credit).toString()),
      };
    })
    .filter((r) => Math.abs(r.net) > 0.0001)
    .sort((a, b) => a.code.localeCompare(b.code));
}

function printBalances(label: string, rows: Awaited<ReturnType<typeof platformAccountBalances>>) {
  console.log(`\n[platform-clear] ${label}`);
  if (rows.length === 0) {
    console.log("  (all platform account nets are zero / no lines)");
    return;
  }
  for (const r of rows) {
    console.log(`  ${r.code} ${r.name}: net ${money(r.net)} (Dr ${money(r.debit)} / Cr ${money(r.credit)})`);
  }
}

async function reverseOneJournal(
  tx: Prisma.TransactionClient,
  journalId: string,
  memoPrefix: string,
): Promise<boolean> {
  const locked = await tx.platformJournalEntry.findUnique({
    where: { id: journalId },
    include: {
      lines: { orderBy: { id: "asc" } },
      reversedByPlatformEntry: { select: { id: true } },
    },
  });
  if (!locked || locked.reversedByPlatformEntry || locked.reversesPlatformJournalEntryId) {
    return false;
  }
  if (locked.lines.length === 0) {
    return false;
  }

  await tx.platformJournalEntry.create({
    data: {
      postedAt: new Date(),
      memo: `${memoPrefix} Original: ${locked.memo ?? locked.id}`,
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
            ? `Reversal (platform clear): ${ln.description.trim()}`
            : "Reversal (platform clear)",
          quantity: ln.quantity,
          unitLabel: ln.unitLabel,
          taxAmount: ln.taxAmount,
        })),
      },
    },
  });
  return true;
}

async function clearBillingLedgers(
  args: Args,
  invoiceIdsFromDevPay: string[] | null,
): Promise<{ cancelled: number; deleted: number; invoiceIds: string[] }> {
  const where: Prisma.BillingLedgerEntryWhereInput = args.devPayOnly
    ? {
        OR: [
          { provider: args.provider },
          { idempotencyKey: { startsWith: DEV_PAY_IDEMPOTENCY_PREFIX } },
        ],
      }
    : {};

  const ledgers = await prisma.billingLedgerEntry.findMany({
    where,
    select: {
      id: true,
      status: true,
      subscriptionInvoiceId: true,
      type: true,
      amount: true,
      provider: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`\n[platform-clear] Billing ledger rows in scope: ${ledgers.length}`);

  const invoiceIds = Array.from(
    new Set(
      ledgers
        .map((l) => l.subscriptionInvoiceId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (invoiceIdsFromDevPay) {
    for (const id of invoiceIdsFromDevPay) {
      if (!invoiceIds.includes(id)) invoiceIds.push(id);
    }
  }

  if (!args.apply) {
    for (const l of ledgers.slice(0, 40)) {
      console.log(
        `  - ledger ${l.id.slice(0, 10)}… ${l.type} ${l.status} ${money(l.amount)} provider=${l.provider}`,
      );
    }
    if (ledgers.length > 40) console.log(`  … and ${ledgers.length - 40} more`);
    return { cancelled: ledgers.length, deleted: 0, invoiceIds };
  }

  if (args.wipe) {
    const deleted = await prisma.billingLedgerEntry.deleteMany({ where });
    return { cancelled: 0, deleted: deleted.count, invoiceIds };
  }

  let cancelled = 0;
  for (const l of ledgers) {
    if (l.status === BillingLedgerStatus.CANCELLED) continue;
    await prisma.billingLedgerEntry.update({
      where: { id: l.id },
      data: {
        status: BillingLedgerStatus.CANCELLED,
        ...(l.status === BillingLedgerStatus.SUCCEEDED
          ? {}
          : { failedAt: l.status === BillingLedgerStatus.PENDING ? new Date() : undefined }),
      },
    });
    cancelled += 1;
  }
  return { cancelled, deleted: 0, invoiceIds };
}

async function voidInvoices(invoiceIds: string[], apply: boolean): Promise<number> {
  if (invoiceIds.length === 0) return 0;
  const paid = await prisma.subscriptionInvoice.findMany({
    where: { id: { in: invoiceIds }, status: InvoiceStatus.PAID },
    select: { id: true, amount: true, currency: true },
  });
  console.log(`[platform-clear] PAID invoices to VOID: ${paid.length}`);
  if (!apply) return paid.length;
  let n = 0;
  for (const inv of paid) {
    await prisma.subscriptionInvoice.update({
      where: { id: inv.id },
      data: { status: InvoiceStatus.VOID, paidAt: null },
    });
    n += 1;
  }
  return n;
}

async function wipePlatformJournals(apply: boolean): Promise<number> {
  const count = await prisma.platformJournalEntry.count();
  console.log(`\n[platform-clear] Platform journals to wipe: ${count}`);
  if (!apply || count === 0) return count;

  await prisma.$transaction(async (tx) => {
    await tx.waveSelfSettlementPayout.updateMany({
      where: { platformJournalEntryId: { not: null } },
      data: { platformJournalEntryId: null },
    });
    await tx.waveOpsPayout.updateMany({
      where: { platformJournalEntryId: { not: null } },
      data: { platformJournalEntryId: null },
    });
    await tx.platformBill.updateMany({
      where: { platformJournalEntryId: { not: null } },
      data: { platformJournalEntryId: null },
    });
    await tx.digitalOceanInvoice.updateMany({
      where: { platformJournalEntryId: { not: null } },
      data: { platformJournalEntryId: null },
    });
    await tx.merchantSettlementRequest.updateMany({
      where: { platformJournalId: { not: null } },
      data: { platformJournalId: null },
    });

    // Break self-FK so deletes are unrestricted.
    await tx.platformJournalEntry.updateMany({
      where: { reversesPlatformJournalEntryId: { not: null } },
      data: { reversesPlatformJournalEntryId: null },
    });

    await tx.platformJournalLine.deleteMany({});
    await tx.platformJournalEntry.deleteMany({});
  });

  return count;
}

async function reverseAllPlatformJournals(args: Args): Promise<{
  reversed: number;
  skippedAlreadyReversed: number;
  skippedIsReversal: number;
  skippedEmpty: number;
}> {
  const where: Prisma.PlatformJournalEntryWhereInput = args.devPayOnly
    ? {
        sourceType: {
          in: [
            PlatformJournalSourceType.SUBSCRIPTION_INVOICE_PAYMENT,
            PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_PENDING,
            PlatformJournalSourceType.SUBSCRIPTION_CHECKOUT_SETTLEMENT,
            PlatformJournalSourceType.SUBSCRIPTION_WALLET_FEE,
            PlatformJournalSourceType.SUBSCRIPTION_REFUND,
          ],
        },
        reversesPlatformJournalEntryId: null,
      }
    : {
        reversesPlatformJournalEntryId: null,
      };

  let journals = await prisma.platformJournalEntry.findMany({
    where,
    include: {
      lines: {
        include: { chartOfAccount: { select: { code: true } } },
      },
      reversedByPlatformEntry: { select: { id: true } },
    },
    orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
  });

  if (args.devPayOnly) {
    const devLedgers = await prisma.billingLedgerEntry.findMany({
      where: {
        OR: [
          { provider: args.provider },
          { idempotencyKey: { startsWith: DEV_PAY_IDEMPOTENCY_PREFIX } },
        ],
      },
      select: { subscriptionInvoiceId: true },
    });
    const invoiceIds = new Set(
      devLedgers.map((l) => l.subscriptionInvoiceId).filter((id): id is string => Boolean(id)),
    );
    journals = journals.filter(
      (j) =>
        (j.sourceId && invoiceIds.has(j.sourceId)) ||
        j.memo?.toLowerCase().includes("dev pay") ||
        j.memo?.toLowerCase().includes("internal_dev"),
    );
  }

  console.log(`\n[platform-clear] Unreversed platform journals in scope: ${journals.length}`);

  let reversed = 0;
  let skippedAlreadyReversed = 0;
  let skippedIsReversal = 0;
  let skippedEmpty = 0;
  let clearingDebitTotal = new Prisma.Decimal(0);

  for (const journal of journals) {
    if (journal.reversesPlatformJournalEntryId) {
      skippedIsReversal += 1;
      continue;
    }
    if (journal.reversedByPlatformEntry) {
      skippedAlreadyReversed += 1;
      continue;
    }
    if (journal.lines.length === 0) {
      skippedEmpty += 1;
      continue;
    }

    const clearingLine = journal.lines.find(
      (ln) => ln.chartOfAccount.code === PLATFORM_CHART_SUBSCRIPTION_CLEARING,
    );
    if (clearingLine && Number(clearingLine.debitAmount) > 0) {
      clearingDebitTotal = clearingDebitTotal.add(clearingLine.debitAmount);
    }

    const header = `${journal.sourceType ?? "MANUAL"} ${journal.id.slice(0, 10)}… memo=${(journal.memo ?? "").slice(0, 60)}`;
    console.log(`  - will reverse ${header}`);

    if (!args.apply) {
      reversed += 1;
      continue;
    }

    const ok = await prisma.$transaction((tx) =>
      reverseOneJournal(tx, journal.id, "Platform clear — reverse recorded activity."),
    );
    if (ok) reversed += 1;
  }

  if (Number(clearingDebitTotal) > 0) {
    console.log(
      `  (of which P-1000 clearing debit total on originals: ${money(clearingDebitTotal)})`,
    );
  }

  return { reversed, skippedAlreadyReversed, skippedIsReversal, skippedEmpty };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.wipe && args.devPayOnly) {
    throw new Error(
      "--wipe clears the entire platform GL; do not combine with --dev-pay-only. Omit --wipe to reverse/cancel Dev Pay only.",
    );
  }
  console.log(
    `[platform-clear] mode=${args.apply ? "APPLY" : "DRY-RUN"} wipe=${args.wipe} ` +
      `devPayOnly=${args.devPayOnly} provider=${args.provider} revertInvoices=${args.revertInvoices}`,
  );
  console.log(
    "[platform-clear] Merchant journals / sales ledgers / tenant CoA will NOT be modified.",
  );

  const merchantBefore = await countMerchantLedgerRows();

  const balancesBefore = await platformAccountBalances();
  printBalances("Platform account nets BEFORE", balancesBefore);

  let journalStats = {
    reversed: 0,
    skippedAlreadyReversed: 0,
    skippedIsReversal: 0,
    skippedEmpty: 0,
  };
  let wipedJournals = 0;

  if (args.wipe) {
    wipedJournals = await wipePlatformJournals(args.apply);
  } else {
    journalStats = await reverseAllPlatformJournals(args);
  }

  const ledgerStats = await clearBillingLedgers(args, null);

  let invoicesVoided = 0;
  if (args.revertInvoices) {
    invoicesVoided = await voidInvoices(ledgerStats.invoiceIds, args.apply);
  }

  await assertMerchantLedgersUntouched(merchantBefore);

  const balancesAfter = args.apply
    ? await platformAccountBalances()
    : balancesBefore;
  if (args.apply) {
    printBalances("Platform account nets AFTER", balancesAfter);
  }

  console.log("\n[platform-clear] Summary");
  if (args.wipe) {
    console.log(`  platform journals wiped:        ${wipedJournals}`);
    console.log(`  billing ledgers deleted:        ${ledgerStats.deleted}`);
  } else {
    console.log(`  journals reversed:              ${journalStats.reversed}`);
    console.log(`  skipped already reversed:       ${journalStats.skippedAlreadyReversed}`);
    console.log(`  skipped (is a reversal):        ${journalStats.skippedIsReversal}`);
    console.log(`  skipped empty:                  ${journalStats.skippedEmpty}`);
    console.log(`  billing ledgers cancelled:      ${ledgerStats.cancelled}`);
  }
  if (args.revertInvoices) {
    console.log(`  invoices voided / to void:      ${invoicesVoided}`);
  }
  console.log(
    `  merchant JournalEntry count:      ${merchantBefore.JournalEntry} (unchanged)`,
  );

  if (!args.apply) {
    console.log("\nDry-run only. Re-run with --apply to write changes.");
    console.log("  --apply                         reverse all unreversed platform journals + cancel billing ledgers");
    console.log("  --apply --wipe                  hard-delete platform journals + billing ledgers");
    console.log("  --apply --revert-invoices       also VOID linked PAID subscription invoices");
    console.log("  --dev-pay-only                  limit to Dev Pay / internal_dev activity only");
    console.log(
      "Note: subscription ACTIVE status is left unchanged — review those tenants separately if needed.",
    );
  } else {
    const stillOpen = balancesAfter.filter((r) => Math.abs(r.net) > 0.0001);
    if (stillOpen.length === 0) {
      console.log("\nDone. Platform account nets are zero. Ready for admin collections.");
    } else {
      console.log(
        `\nDone, but ${stillOpen.length} platform account(s) still show a net — inspect AFTER balances above.`,
      );
    }
  }
}

main()
  .catch((err) => {
    console.error("[platform-clear] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
