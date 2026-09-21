/**
 * Clear merchant "Wave operations payouts received" (WAVE_MERCHANT_PAYOUTS) ledgers.
 *
 * Live cleanup case: platform WAVE_OPS journals were wiped, but merchant
 * WAVE_OPS_MERCHANT_PAYOUT journals (and sales ledger rows) remain as orphans.
 *
 * Usage (from backend/, against the target DATABASE_URL):
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --orphans
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --orphans --apply
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --orphans --apply --wipe
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --all --apply --wipe
 *
 * Flags:
 *   --orphans               Only merchant WAVE_OPS journals with no platform journal left (default recommended)
 *   --apply                 Write changes (default dry-run)
 *   --wipe                  Hard-delete matched journals + sales ledger (after reverse if needed)
 *   --all                   Include every WAVE_OPS merchant payout journal (paired or orphan)
 *   --merchant-contains=X   Filter by business name
 *   --memo-contains=X       Filter by journal memo
 *   --reference=X           Filter by journal reference / Wave client reference
 *   --amount=N              Filter by journal line amount
 *   --journal-id=ID         Exact merchant journal id (original or reversal)
 *   --source-id=ID          WaveOpsPayout id (journal sourceId)
 *   --posted-at=YYYY-MM-DD  Reversal date when an open original must be reversed first
 */
import "dotenv/config";
import {
  JournalSourceType,
  PlatformJournalSourceType,
  Prisma,
  PrismaClient,
  SalesLedgerEntryType,
  SalesLedgerStatus,
} from "@prisma/client";

import { reverseMerchantJournalForWaveOpsPayout } from "../src/services/merchant-payout-journal.service.js";

const prisma = new PrismaClient();

type Args = {
  apply: boolean;
  wipe: boolean;
  all: boolean;
  orphans: boolean;
  merchantContains: string | null;
  memoContains: string | null;
  reference: string | null;
  amount: Prisma.Decimal | null;
  journalId: string | null;
  sourceId: string | null;
  postedAt: string;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let wipe = false;
  let all = false;
  let orphans = false;
  let merchantContains: string | null = null;
  let memoContains: string | null = null;
  let reference: string | null = null;
  let amount: Prisma.Decimal | null = null;
  let journalId: string | null = null;
  let sourceId: string | null = null;
  let postedAt = new Date().toISOString().slice(0, 10);

  for (const raw of argv) {
    if (raw === "--apply") apply = true;
    else if (raw === "--wipe") wipe = true;
    else if (raw === "--all") all = true;
    else if (raw === "--orphans") orphans = true;
    else if (raw.startsWith("--merchant-contains=")) {
      merchantContains = raw.slice("--merchant-contains=".length).trim() || null;
    } else if (raw.startsWith("--memo-contains=")) {
      memoContains = raw.slice("--memo-contains=".length).trim() || null;
    } else if (raw.startsWith("--reference=")) {
      reference = raw.slice("--reference=".length).trim() || null;
    } else if (raw.startsWith("--amount=")) {
      const v = raw.slice("--amount=".length).trim();
      if (v) amount = new Prisma.Decimal(v);
    } else if (raw.startsWith("--journal-id=")) {
      journalId = raw.slice("--journal-id=".length).trim() || null;
    } else if (raw.startsWith("--source-id=")) {
      sourceId = raw.slice("--source-id=".length).trim() || null;
    } else if (raw.startsWith("--posted-at=")) {
      const v = raw.slice("--posted-at=".length).trim();
      if (v) postedAt = v;
    }
  }

  // Default to orphans when no other scope flag is given.
  if (!all && !orphans && !journalId && !sourceId) {
    orphans = true;
  }

  return {
    apply,
    wipe,
    all,
    orphans,
    merchantContains,
    memoContains,
    reference,
    amount,
    journalId,
    sourceId,
    postedAt,
  };
}

function money(n: Prisma.Decimal | number | string): string {
  return Number(n).toFixed(2);
}

function lineAmount(lines: Array<{ debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }>): Prisma.Decimal {
  return lines.reduce((max, ln) => {
    const d = ln.debitAmount.gt(ln.creditAmount) ? ln.debitAmount : ln.creditAmount;
    return d.gt(max) ? d : max;
  }, new Prisma.Decimal(0));
}

type Match = {
  id: string;
  businessId: string;
  businessName: string;
  memo: string | null;
  reference: string | null;
  postedAt: Date;
  sourceType: JournalSourceType | null;
  sourceId: string | null;
  reversesJournalEntryId: string | null;
  alreadyReversed: boolean;
  isReversal: boolean;
  orphan: boolean;
  amount: Prisma.Decimal;
  lines: Array<{ code: string; name: string; debit: string; credit: string; description: string | null }>;
};

/**
 * A merchant WAVE_OPS journal is an orphan when the platform GL for that payout is gone:
 *  - WaveOpsPayout.platformJournalEntryId is null (or payout missing), AND
 *  - no PlatformJournalEntry WAVE_OPS_PAYOUT / REVERSAL with sourceId = payout id
 */
async function payoutIdsWithPlatformJournal(): Promise<Set<string>> {
  const withLink = await prisma.waveOpsPayout.findMany({
    where: { platformJournalEntryId: { not: null } },
    select: { id: true },
  });
  const platformRows = await prisma.platformJournalEntry.findMany({
    where: {
      sourceType: {
        in: [PlatformJournalSourceType.WAVE_OPS_PAYOUT, PlatformJournalSourceType.WAVE_OPS_PAYOUT_REVERSAL],
      },
      sourceId: { not: null },
    },
    select: { sourceId: true },
  });
  const ids = new Set<string>();
  for (const p of withLink) ids.add(p.id);
  for (const j of platformRows) {
    if (j.sourceId) ids.add(j.sourceId);
  }
  return ids;
}

async function findMatches(args: Args): Promise<Match[]> {
  const where: Prisma.JournalEntryWhereInput = {
    sourceType: {
      in: [
        JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT,
        JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT_REVERSAL,
      ],
    },
  };

  if (args.journalId) {
    where.OR = [{ id: args.journalId }, { reversesJournalEntryId: args.journalId }];
  } else {
    if (args.sourceId) where.sourceId = args.sourceId;
    if (args.reference) where.reference = { equals: args.reference, mode: "insensitive" };
    if (args.memoContains) where.memo = { contains: args.memoContains, mode: "insensitive" };
    if (args.merchantContains) {
      where.business = { name: { contains: args.merchantContains, mode: "insensitive" } };
    }
  }

  const rows = await prisma.journalEntry.findMany({
    where,
    include: {
      lines: {
        include: { chartOfAccount: { select: { code: true, name: true } } },
        orderBy: { id: "asc" },
      },
      business: { select: { id: true, name: true } },
      reversedByEntry: { select: { id: true } },
    },
    orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
    take: 500,
  });

  const platformPresent = await payoutIdsWithPlatformJournal();

  return rows
    .map((row) => {
      const orphan = !row.sourceId || !platformPresent.has(row.sourceId);
      return {
        id: row.id,
        businessId: row.businessId,
        businessName: row.business.name,
        memo: row.memo,
        reference: row.reference,
        postedAt: row.postedAt,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        reversesJournalEntryId: row.reversesJournalEntryId,
        alreadyReversed: Boolean(row.reversedByEntry),
        isReversal: Boolean(row.reversesJournalEntryId),
        orphan,
        amount: lineAmount(row.lines),
        lines: row.lines.map((ln) => ({
          code: ln.chartOfAccount.code,
          name: ln.chartOfAccount.name,
          debit: ln.debitAmount.toString(),
          credit: ln.creditAmount.toString(),
          description: ln.description,
        })),
      };
    })
    .filter((r) => (args.amount ? r.amount.eq(args.amount) : true))
    .filter((r) => (args.orphans && !args.all ? r.orphan : true));
}

function printMatch(m: Match) {
  console.log(`\n[merchant] ${m.id}${m.orphan ? "  ← ORPHAN (no platform journal)" : ""}`);
  console.log(`  business: ${m.businessName} (${m.businessId})`);
  console.log(`  postedAt: ${m.postedAt.toISOString()}`);
  console.log(`  sourceType: ${m.sourceType} sourceId=${m.sourceId}`);
  console.log(`  reference: ${m.reference}`);
  console.log(`  memo: ${m.memo}`);
  console.log(`  amount: ${money(m.amount)}`);
  console.log(
    `  flags: orphan=${m.orphan} isReversal=${m.isReversal} alreadyReversed=${m.alreadyReversed} reverses=${m.reversesJournalEntryId ?? "-"}`,
  );
  for (const ln of m.lines) {
    console.log(`    ${ln.code} (${ln.name}) Dr ${ln.debit} Cr ${ln.credit} — ${ln.description ?? ""}`);
  }
}

async function waveOpsAccountNets(): Promise<
  Array<{ business: string; debit: string; credit: string; net: string; lines: number }>
> {
  const accounts = await prisma.chartOfAccount.findMany({
    where: { code: "WAVE_MERCHANT_PAYOUTS" },
    select: { id: true, business: { select: { name: true } } },
  });
  const out = [];
  for (const a of accounts) {
    const agg = await prisma.journalLine.aggregate({
      where: { chartOfAccountId: a.id },
      _sum: { debitAmount: true, creditAmount: true },
      _count: true,
    });
    const debit = agg._sum.debitAmount ?? new Prisma.Decimal(0);
    const credit = agg._sum.creditAmount ?? new Prisma.Decimal(0);
    const net = debit.sub(credit);
    if (agg._count === 0 && net.eq(0)) continue;
    out.push({
      business: a.business.name,
      debit: money(debit),
      credit: money(credit),
      net: money(net),
      lines: agg._count,
    });
  }
  return out;
}

async function wipeJournalIds(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return;

  await prisma.$transaction(async (tx) => {
    await tx.salesLedgerEntry.deleteMany({
      where: { journalEntryId: { in: unique } },
    });
    await tx.journalEntry.updateMany({
      where: { id: { in: unique }, reversesJournalEntryId: { not: null } },
      data: { reversesJournalEntryId: null },
    });
    await tx.journalLine.deleteMany({ where: { journalEntryId: { in: unique } } });
    await tx.journalEntry.deleteMany({ where: { id: { in: unique } } });
  });
}

/**
 * Reverse an open merchant WAVE_OPS journal even when WaveOpsPayout / platform side is gone.
 * Uses sourceId when present; otherwise reverses by journal id directly.
 */
async function reverseOrphanMerchantJournal(m: Match, postedAt: Date): Promise<string | null> {
  if (m.sourceId) {
    const result = await prisma.$transaction(async (tx) => {
      return reverseMerchantJournalForWaveOpsPayout(tx, m.sourceId!, postedAt);
    });
    return result?.id ?? null;
  }

  return prisma.$transaction(async (tx) => {
    const original = await tx.journalEntry.findUnique({
      where: { id: m.id },
      include: {
        lines: { orderBy: { id: "asc" } },
        reversedByEntry: { select: { id: true } },
      },
    });
    if (!original || original.reversedByEntry || original.reversesJournalEntryId) {
      return original?.reversedByEntry?.id ?? null;
    }
    const reversal = await tx.journalEntry.create({
      data: {
        businessId: original.businessId,
        postedAt,
        memo: original.memo?.trim()
          ? `Reversal of ${original.memo.trim()}`
          : `Reversal of orphan Wave ops merchant payout (${original.id})`,
        reference: original.reference,
        sourceType: JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT_REVERSAL,
        sourceId: original.sourceId ?? original.id,
        reversesJournalEntryId: original.id,
        journalApprovalExempt: true,
        lines: {
          create: original.lines.map((ln) => ({
            chartOfAccountId: ln.chartOfAccountId,
            debitAmount: ln.creditAmount,
            creditAmount: ln.debitAmount,
            description: ln.description?.trim()
              ? `Reversal: ${ln.description.trim()}`
              : "Reversal of Wave ops merchant payout line",
            quantity: ln.quantity,
            unitLabel: ln.unitLabel,
            taxAmount: ln.taxAmount,
          })),
        },
      },
      select: { id: true },
    });
    await tx.salesLedgerEntry.updateMany({
      where: {
        journalEntryId: original.id,
        type: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
        status: SalesLedgerStatus.SUCCEEDED,
      },
      data: { status: SalesLedgerStatus.REVERSED },
    });
    return reversal.id;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[wave-ops-ledger] mode=${args.apply ? "APPLY" : "DRY-RUN"} wipe=${args.wipe} ` +
      `orphans=${args.orphans} all=${args.all}`,
  );
  console.log(
    "[wave-ops-ledger] Scope: merchant WAVE_OPS journals only (platform journals are not modified).",
  );

  const hasFilter = Boolean(
    args.all ||
      args.orphans ||
      args.journalId ||
      args.sourceId ||
      args.reference ||
      args.memoContains ||
      args.merchantContains ||
      args.amount,
  );
  if (!hasFilter) {
    throw new Error(
      "Refusing broad run. Pass --orphans (recommended), --all, or a specific filter.",
    );
  }

  const before = await waveOpsAccountNets();
  console.log("\n[wave-ops-ledger] WAVE_MERCHANT_PAYOUTS nets BEFORE");
  if (!before.length) console.log("  (no lines)");
  for (const r of before) {
    console.log(`  ${r.business}: net ${r.net} (Dr ${r.debit} / Cr ${r.credit}, lines=${r.lines})`);
  }

  const matches = await findMatches(args);
  console.log(`\n[wave-ops-ledger] matched journals: ${matches.length}`);
  for (const m of matches) printMatch(m);

  if (!matches.length) {
    console.log(
      "\nNothing to clear on this DATABASE_URL. If this is local, point .env at live and re-run --orphans.",
    );
    return;
  }

  const openOriginals = matches.filter(
    (m) =>
      m.sourceType === JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT &&
      !m.isReversal &&
      !m.alreadyReversed,
  );

  if (!args.apply) {
    console.log("\nDry-run only.");
    console.log(`  orphans in match set: ${matches.filter((m) => m.orphan).length}`);
    console.log(`  open originals to reverse: ${openOriginals.length}`);
    console.log(`  journals that --wipe would delete: ${matches.length}`);
    console.log("Re-run with --apply (add --wipe to remove history after reverse).");
    return;
  }

  const postedAt = new Date(`${args.postedAt}T12:00:00.000Z`);
  let reversed = 0;
  for (const m of openOriginals) {
    const reversalId = await reverseOrphanMerchantJournal(m, postedAt);
    reversed += 1;
    console.log(
      `[wave-ops-ledger] Reversed open orphan journal ${m.id} → ${reversalId ?? "(already reversed)"}`,
    );
  }

  const afterReverse = await findMatches(args);
  const wipeIds = afterReverse.map((m) => m.id);

  const sourceIds = [
    ...new Set(afterReverse.map((m) => m.sourceId).filter((id): id is string => Boolean(id))),
  ];
  if (sourceIds.length) {
    const extraLedgers = await prisma.salesLedgerEntry.findMany({
      where: {
        type: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
        providerPaymentRef: { in: sourceIds },
      },
      select: { journalEntryId: true },
    });
    for (const e of extraLedgers) wipeIds.push(e.journalEntryId);
  }

  if (args.wipe) {
    await wipeJournalIds(wipeIds);
    if (sourceIds.length) {
      await prisma.salesLedgerEntry.deleteMany({
        where: {
          type: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
          providerPaymentRef: { in: sourceIds },
        },
      });
    }
    console.log(
      `[wave-ops-ledger] Wiped ${[...new Set(wipeIds)].length} merchant journal(s) + linked sales ledger rows.`,
    );
  } else if (reversed) {
    console.log(`[wave-ops-ledger] Reversed ${reversed} open journal(s). Add --wipe to delete history.`);
  } else {
    console.log(
      "[wave-ops-ledger] Nothing open to reverse (already netted). Re-run with --wipe to delete the orphan history rows.",
    );
  }

  const after = await waveOpsAccountNets();
  console.log("\n[wave-ops-ledger] WAVE_MERCHANT_PAYOUTS nets AFTER");
  if (!after.length) console.log("  (no lines — account is clear)");
  for (const r of after) {
    console.log(`  ${r.business}: net ${r.net} (Dr ${r.debit} / Cr ${r.credit}, lines=${r.lines})`);
  }

  console.log("\n[wave-ops-ledger] Done.");
}

main()
  .catch((err) => {
    console.error("[wave-ops-ledger] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
