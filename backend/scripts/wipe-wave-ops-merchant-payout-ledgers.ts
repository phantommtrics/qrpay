/**
 * Clear merchant "Wave operations payouts received" (WAVE_MERCHANT_PAYOUTS) ledger legs.
 *
 * Live case: platform WAVE_OPS journals were wiped, but merchant journals still have
 * legs on WAVE_MERCHANT_PAYOUTS — e.g. ref:
 *   "DPAY-12 DirectPay settlement — BarakahFunds — 48900.00 GMD"
 *
 * Matching is by **account lines** (not only WAVE_OPS sourceType), so mis-tagged or
 * orphan journals are still found.
 *
 * Usage (from backend/, against live DATABASE_URL):
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --orphans
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --reference-contains="DPAY-12" --amount=48900
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --reference-contains="DPAY-12" --amount=48900 --apply --wipe
 *   npx tsx scripts/wipe-wave-ops-merchant-payout-ledgers.ts --memo-contains=BarakahFunds --apply --wipe
 *
 * Flags:
 *   --orphans                  Only journals whose WaveOpsPayout has no platform journal
 *   --apply                    Write changes (default dry-run)
 *   --wipe                     Hard-delete matched journals + sales ledger (after reverse if needed)
 *   --all                      Every journal that has a WAVE_MERCHANT_PAYOUTS line
 *   --merchant-contains=X      Filter by business name
 *   --memo-contains=X          Substring on journal memo
 *   --reference=X              Exact journal reference
 *   --reference-contains=X     Substring on journal reference OR line description
 *   --amount=N                 Match line amount on WAVE_MERCHANT_PAYOUTS
 *   --journal-id=ID            Exact merchant journal id
 *   --source-id=ID             WaveOpsPayout id / journal sourceId
 *   --posted-at=YYYY-MM-DD     Reversal posted date
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
const ACCOUNT_CODE = "WAVE_MERCHANT_PAYOUTS";

type Args = {
  apply: boolean;
  wipe: boolean;
  all: boolean;
  orphans: boolean;
  merchantContains: string | null;
  memoContains: string | null;
  reference: string | null;
  referenceContains: string | null;
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
  let referenceContains: string | null = null;
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
    } else if (raw.startsWith("--reference-contains=")) {
      referenceContains = raw.slice("--reference-contains=".length).trim() || null;
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

  if (
    !all &&
    !orphans &&
    !journalId &&
    !sourceId &&
    !reference &&
    !referenceContains &&
    !memoContains &&
    !merchantContains &&
    !amount
  ) {
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
    referenceContains,
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
  waveOpsLegs: Array<{ debit: string; credit: string; description: string | null }>;
  lines: Array<{ code: string; name: string; debit: string; credit: string; description: string | null }>;
};

async function payoutIdsWithPlatformJournal(): Promise<Set<string>> {
  const withLink = await prisma.waveOpsPayout.findMany({
    where: { platformJournalEntryId: { not: null } },
    select: { id: true },
  });
  const platformRows = await prisma.platformJournalEntry.findMany({
    where: {
      sourceType: {
        in: [
          PlatformJournalSourceType.WAVE_OPS_PAYOUT,
          PlatformJournalSourceType.WAVE_OPS_PAYOUT_REVERSAL,
        ],
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

/**
 * Find journals that have at least one line on WAVE_MERCHANT_PAYOUTS, then apply filters.
 * Also pulls in reversal/original pairs so wipe removes both legs.
 */
async function findMatches(args: Args): Promise<Match[]> {
  const lineWhere: Prisma.JournalLineWhereInput = {
    chartOfAccount: { code: ACCOUNT_CODE },
  };
  if (args.amount) {
    lineWhere.OR = [
      { debitAmount: args.amount },
      { creditAmount: args.amount },
    ];
  }

  const legRows = await prisma.journalLine.findMany({
    where: lineWhere,
    select: { journalEntryId: true },
    take: 5000,
  });
  const seedIds = new Set(legRows.map((r) => r.journalEntryId));

  // Also seed from journal-level filters (ref may be on the entry, not the line).
  if (
    args.journalId ||
    args.sourceId ||
    args.reference ||
    args.referenceContains ||
    args.memoContains ||
    args.merchantContains
  ) {
    const entryWhere: Prisma.JournalEntryWhereInput = {};
    if (args.journalId) {
      entryWhere.OR = [{ id: args.journalId }, { reversesJournalEntryId: args.journalId }];
    } else {
      const and: Prisma.JournalEntryWhereInput[] = [];
      if (args.sourceId) and.push({ sourceId: args.sourceId });
      if (args.reference) and.push({ reference: { equals: args.reference, mode: "insensitive" } });
      if (args.referenceContains) {
        and.push({
          OR: [
            { reference: { contains: args.referenceContains, mode: "insensitive" } },
            { memo: { contains: args.referenceContains, mode: "insensitive" } },
            {
              lines: {
                some: {
                  description: { contains: args.referenceContains, mode: "insensitive" },
                },
              },
            },
          ],
        });
      }
      if (args.memoContains) and.push({ memo: { contains: args.memoContains, mode: "insensitive" } });
      if (args.merchantContains) {
        and.push({ business: { name: { contains: args.merchantContains, mode: "insensitive" } } });
      }
      // Prefer journals that touch WAVE_MERCHANT_PAYOUTS when searching by text.
      and.push({ lines: { some: { chartOfAccount: { code: ACCOUNT_CODE } } } });
      if (and.length) entryWhere.AND = and;
    }

    const entries = await prisma.journalEntry.findMany({
      where: entryWhere,
      select: { id: true, reversesJournalEntryId: true },
      take: 500,
    });
    for (const e of entries) {
      seedIds.add(e.id);
      if (e.reversesJournalEntryId) seedIds.add(e.reversesJournalEntryId);
    }
  }

  if (!seedIds.size && (args.all || args.orphans)) {
    const allLegs = await prisma.journalLine.findMany({
      where: { chartOfAccount: { code: ACCOUNT_CODE } },
      select: { journalEntryId: true },
      take: 5000,
    });
    for (const r of allLegs) seedIds.add(r.journalEntryId);
  }

  if (!seedIds.size) return [];

  // Expand to include originals + reversals for every seed.
  const linked = await prisma.journalEntry.findMany({
    where: {
      OR: [
        { id: { in: [...seedIds] } },
        { reversesJournalEntryId: { in: [...seedIds] } },
      ],
    },
    select: { id: true, reversesJournalEntryId: true },
  });
  const allIds = new Set<string>();
  for (const j of linked) {
    allIds.add(j.id);
    if (j.reversesJournalEntryId) allIds.add(j.reversesJournalEntryId);
  }
  const reverseLinks = await prisma.journalEntry.findMany({
    where: { reversesJournalEntryId: { in: [...allIds] } },
    select: { id: true },
  });
  for (const j of reverseLinks) allIds.add(j.id);

  const rows = await prisma.journalEntry.findMany({
    where: { id: { in: [...allIds] } },
    include: {
      lines: {
        include: { chartOfAccount: { select: { code: true, name: true } } },
        orderBy: { id: "asc" },
      },
      business: { select: { id: true, name: true } },
      reversedByEntry: { select: { id: true } },
    },
    orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
  });

  const platformPresent = await payoutIdsWithPlatformJournal();

  return rows
    .map((row) => {
      const waveOpsLegs = row.lines.filter((ln) => ln.chartOfAccount.code === ACCOUNT_CODE);
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
        amount: lineAmount(waveOpsLegs.length ? waveOpsLegs : row.lines),
        waveOpsLegs: waveOpsLegs.map((ln) => ({
          debit: ln.debitAmount.toString(),
          credit: ln.creditAmount.toString(),
          description: ln.description,
        })),
        lines: row.lines.map((ln) => ({
          code: ln.chartOfAccount.code,
          name: ln.chartOfAccount.name,
          debit: ln.debitAmount.toString(),
          credit: ln.creditAmount.toString(),
          description: ln.description,
        })),
      };
    })
    .filter((r) => r.waveOpsLegs.length > 0)
    .filter((r) => (args.amount ? r.amount.eq(args.amount) : true))
    .filter((r) => {
      if (!args.referenceContains) return true;
      const needle = args.referenceContains.toLowerCase();
      return (
        (r.reference ?? "").toLowerCase().includes(needle) ||
        (r.memo ?? "").toLowerCase().includes(needle) ||
        r.lines.some((ln) => (ln.description ?? "").toLowerCase().includes(needle))
      );
    })
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
    `  flags: orphan=${m.orphan} isReversal=${m.isReversal} alreadyReversed=${m.alreadyReversed}`,
  );
  for (const ln of m.lines) {
    const mark = ln.code === ACCOUNT_CODE ? " ★" : "";
    console.log(
      `    ${ln.code} (${ln.name}) Dr ${ln.debit} Cr ${ln.credit} — ${ln.description ?? ""}${mark}`,
    );
  }
}

async function waveOpsAccountNets(): Promise<
  Array<{ business: string; debit: string; credit: string; net: string; lines: number }>
> {
  const accounts = await prisma.chartOfAccount.findMany({
    where: { code: ACCOUNT_CODE },
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

async function reverseOpenJournal(m: Match, postedAt: Date): Promise<string | null> {
  if (m.sourceType === JournalSourceType.WAVE_OPS_MERCHANT_PAYOUT && m.sourceId) {
    const result = await prisma.$transaction(async (tx) => {
      return reverseMerchantJournalForWaveOpsPayout(tx, m.sourceId!, postedAt);
    });
    return result?.id ?? null;
  }

  // Generic reverse for any journal that still has open WAVE_MERCHANT_PAYOUTS legs.
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
          : `Reversal of WAVE_MERCHANT_PAYOUTS legs (${original.id})`,
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
    `[wave-ops-ledger] Matching journal lines on account ${ACCOUNT_CODE} ` +
      `(platform journals are not modified).`,
  );
  console.log(
    `[wave-ops-ledger] filters reference=${args.reference ?? "-"} ` +
      `referenceContains=${args.referenceContains ?? "-"} ` +
      `memoContains=${args.memoContains ?? "-"} amount=${args.amount ? money(args.amount) : "-"} ` +
      `merchantContains=${args.merchantContains ?? "-"}`,
  );

  const before = await waveOpsAccountNets();
  console.log(`\n[wave-ops-ledger] ${ACCOUNT_CODE} nets BEFORE`);
  if (!before.length) console.log("  (no lines)");
  for (const r of before) {
    console.log(`  ${r.business}: net ${r.net} (Dr ${r.debit} / Cr ${r.credit}, lines=${r.lines})`);
  }

  const matches = await findMatches(args);
  console.log(`\n[wave-ops-ledger] matched journals: ${matches.length}`);
  for (const m of matches) printMatch(m);

  if (!matches.length) {
    console.log(
      "\nNothing matched. Try:\n" +
        '  --reference-contains="DPAY-12" --amount=48900\n' +
        "  --memo-contains=BarakahFunds --amount=48900\n" +
        "  --orphans --all\n" +
        "and confirm DATABASE_URL points at live.",
    );
    return;
  }

  const openOriginals = matches.filter((m) => !m.isReversal && !m.alreadyReversed);

  if (!args.apply) {
    console.log("\nDry-run only.");
    console.log(`  orphans in match set: ${matches.filter((m) => m.orphan).length}`);
    console.log(`  open originals to reverse: ${openOriginals.length}`);
    console.log(`  journals --wipe would delete: ${matches.length}`);
    console.log(
      "\nTo remove the WAVE_MERCHANT_PAYOUTS legs from history, re-run with --apply --wipe.",
    );
    return;
  }

  const postedAt = new Date(`${args.postedAt}T12:00:00.000Z`);
  let reversed = 0;
  for (const m of openOriginals) {
    const reversalId = await reverseOpenJournal(m, postedAt);
    reversed += 1;
    console.log(
      `[wave-ops-ledger] Reversed open journal ${m.id} → ${reversalId ?? "(already reversed)"}`,
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
        OR: [
          { journalEntryId: { in: wipeIds } },
          {
            type: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
            providerPaymentRef: { in: sourceIds },
          },
        ],
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
          OR: [
            { journalEntryId: { in: [...new Set(wipeIds)] } },
            {
              type: SalesLedgerEntryType.WAVE_OPS_PAYOUT,
              providerPaymentRef: { in: sourceIds },
            },
          ],
        },
      });
    }
    console.log(
      `[wave-ops-ledger] Wiped ${[...new Set(wipeIds)].length} journal(s) + linked sales ledger rows.`,
    );
  } else if (reversed) {
    console.log(
      `[wave-ops-ledger] Reversed ${reversed} open journal(s). Add --wipe to delete the legs from history.`,
    );
  } else {
    console.log(
      "[wave-ops-ledger] Already reversed/netted. Re-run with --wipe to delete the orphan legs.",
    );
  }

  const after = await waveOpsAccountNets();
  console.log(`\n[wave-ops-ledger] ${ACCOUNT_CODE} nets AFTER`);
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
