/**
 * Reverse (or wipe) a wrong platform→merchant fund transfer / clearing settlement.
 *
 * Typical case: admin completed a settlement to the wrong merchant / amount.
 * Narration looks like:
 *   "Clearing settlement to BarakahFunds (GMD 48900.00 · DPAY-12) · DirectPay settlement received (bank / manual)"
 * Merchant ledger: PLATFORM_FUND_TRANSFERS ("DirectPay settlement received").
 *
 * Default action is a proper double-entry reversal (platform + merchant + reopen settlement request).
 * Use --wipe only if you need the rows removed after reversal is not enough.
 *
 * Usage (from backend/, against the target DATABASE_URL):
 *   npx tsx scripts/reverse-wrong-merchant-settlement.ts --reference=DPAY-12 --amount=48900
 *   npx tsx scripts/reverse-wrong-merchant-settlement.ts --memo-contains=BarakahFunds --amount=48900
 *   npx tsx scripts/reverse-wrong-merchant-settlement.ts --platform-journal-id=<id> --apply
 *   npx tsx scripts/reverse-wrong-merchant-settlement.ts --merchant-journal-id=<id> --apply
 *   npx tsx scripts/reverse-wrong-merchant-settlement.ts --reference=DPAY-12 --amount=48900 --apply --wipe
 *
 * Flags:
 *   --apply                    Write changes (default dry-run)
 *   --wipe                     Hard-delete matched journals after reversing (or alone if already reversed)
 *   --no-notify                Skip owner push notification on reverse
 *   --reference=X              Match platform/merchant journal reference (e.g. DPAY-12)
 *   --amount=N                 Match line amount (e.g. 48900)
 *   --memo-contains=X          Substring match on memo (case-insensitive)
 *   --merchant-contains=X      Substring match on business name
 *   --platform-journal-id=ID   Exact platform journal id
 *   --merchant-journal-id=ID   Exact merchant journal id
 *   --posted-at=YYYY-MM-DD     Reversal posted date (default: today UTC)
 */
import "dotenv/config";
import {
  JournalSourceType,
  MerchantSettlementRequestStatus,
  PlatformJournalSourceType,
  Prisma,
  PrismaClient,
  SalesLedgerEntryType,
  SalesLedgerStatus,
} from "@prisma/client";

import { notifyBusinessOwnersOfFundTransfer } from "../src/services/business-owner-push.service.js";
import { reverseMerchantJournalForPlatformFundTransfer } from "../src/services/merchant-payout-journal.service.js";
import { reversePlatformJournalEntry } from "../src/services/platform-journal-reversal.service.js";
import { reopenSettlementRequestForReversedJournal } from "../src/services/platform-settlement-complete.service.js";

const prisma = new PrismaClient();

type Args = {
  apply: boolean;
  wipe: boolean;
  notify: boolean;
  reference: string | null;
  amount: Prisma.Decimal | null;
  memoContains: string | null;
  merchantContains: string | null;
  platformJournalId: string | null;
  merchantJournalId: string | null;
  postedAt: string;
};

function parseArgs(argv: string[]): Args {
  let apply = false;
  let wipe = false;
  let notify = true;
  let reference: string | null = null;
  let amount: Prisma.Decimal | null = null;
  let memoContains: string | null = null;
  let merchantContains: string | null = null;
  let platformJournalId: string | null = null;
  let merchantJournalId: string | null = null;
  let postedAt = new Date().toISOString().slice(0, 10);

  for (const raw of argv) {
    if (raw === "--apply") apply = true;
    else if (raw === "--wipe") wipe = true;
    else if (raw === "--no-notify") notify = false;
    else if (raw.startsWith("--reference=")) reference = raw.slice("--reference=".length).trim() || null;
    else if (raw.startsWith("--amount=")) {
      const v = raw.slice("--amount=".length).trim();
      if (v) amount = new Prisma.Decimal(v);
    } else if (raw.startsWith("--memo-contains=")) {
      memoContains = raw.slice("--memo-contains=".length).trim() || null;
    } else if (raw.startsWith("--merchant-contains=")) {
      merchantContains = raw.slice("--merchant-contains=".length).trim() || null;
    } else if (raw.startsWith("--platform-journal-id=")) {
      platformJournalId = raw.slice("--platform-journal-id=".length).trim() || null;
    } else if (raw.startsWith("--merchant-journal-id=")) {
      merchantJournalId = raw.slice("--merchant-journal-id=".length).trim() || null;
    } else if (raw.startsWith("--posted-at=")) {
      const v = raw.slice("--posted-at=".length).trim();
      if (v) postedAt = v;
    }
  }

  return {
    apply,
    wipe,
    notify,
    reference,
    amount,
    memoContains,
    merchantContains,
    platformJournalId,
    merchantJournalId,
    postedAt,
  };
}

function money(n: Prisma.Decimal | number | string): string {
  return Number(n).toFixed(2);
}

function hasStrongFilter(args: Args): boolean {
  return Boolean(
    args.platformJournalId ||
      args.merchantJournalId ||
      args.reference ||
      args.amount ||
      args.memoContains ||
      args.merchantContains,
  );
}

type PlatformMatch = {
  id: string;
  memo: string | null;
  reference: string | null;
  postedAt: Date;
  sourceType: PlatformJournalSourceType | null;
  sourceId: string | null;
  businessId: string | null;
  businessName: string | null;
  alreadyReversed: boolean;
  amount: Prisma.Decimal;
  lines: Array<{ code: string; name: string; debit: string; credit: string; description: string | null }>;
};

type MerchantMatch = {
  id: string;
  memo: string | null;
  reference: string | null;
  postedAt: Date;
  sourceType: JournalSourceType | null;
  sourceId: string | null;
  businessId: string;
  businessName: string;
  alreadyReversed: boolean;
  amount: Prisma.Decimal;
  lines: Array<{ code: string; name: string; debit: string; credit: string; description: string | null }>;
};

function lineAmount(lines: Array<{ debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }>): Prisma.Decimal {
  return lines.reduce((max, ln) => {
    const d = ln.debitAmount.gt(ln.creditAmount) ? ln.debitAmount : ln.creditAmount;
    return d.gt(max) ? d : max;
  }, new Prisma.Decimal(0));
}

function amountMatches(actual: Prisma.Decimal, expected: Prisma.Decimal | null): boolean {
  if (!expected) return true;
  return actual.eq(expected);
}

async function findPlatformMatches(args: Args): Promise<PlatformMatch[]> {
  if (args.platformJournalId) {
    const row = await prisma.platformJournalEntry.findUnique({
      where: { id: args.platformJournalId },
      include: {
        lines: { include: { chartOfAccount: { select: { code: true, name: true } } } },
        reversedByPlatformEntry: { select: { id: true } },
        business: { select: { id: true, name: true } },
      },
    });
    if (!row) return [];
    return [
      {
        id: row.id,
        memo: row.memo,
        reference: row.reference,
        postedAt: row.postedAt,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        businessId: row.businessId,
        businessName: row.business?.name ?? null,
        alreadyReversed: Boolean(row.reversedByPlatformEntry || row.reversesPlatformJournalEntryId),
        amount: lineAmount(row.lines),
        lines: row.lines.map((ln) => ({
          code: ln.chartOfAccount.code,
          name: ln.chartOfAccount.name,
          debit: ln.debitAmount.toString(),
          credit: ln.creditAmount.toString(),
          description: ln.description,
        })),
      },
    ];
  }

  const where: Prisma.PlatformJournalEntryWhereInput = {
    reversesPlatformJournalEntryId: null,
    sourceType: {
      in: [
        PlatformJournalSourceType.MERCHANT_FUND_TRANSFER,
        PlatformJournalSourceType.MERCHANT_FUND_TRANSFER_REVERSAL,
      ],
    },
    AND: [
      ...(args.reference ? [{ reference: { equals: args.reference, mode: "insensitive" as const } }] : []),
      ...(args.memoContains
        ? [{ memo: { contains: args.memoContains, mode: "insensitive" as const } }]
        : []),
      ...(args.merchantContains
        ? [{ business: { name: { contains: args.merchantContains, mode: "insensitive" as const } } }]
        : []),
    ],
  };

  const rows = await prisma.platformJournalEntry.findMany({
    where,
    include: {
      lines: { include: { chartOfAccount: { select: { code: true, name: true } } } },
      reversedByPlatformEntry: { select: { id: true } },
      business: { select: { id: true, name: true } },
    },
    orderBy: { postedAt: "desc" },
    take: 50,
  });

  return rows
    .map((row) => ({
      id: row.id,
      memo: row.memo,
      reference: row.reference,
      postedAt: row.postedAt,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      businessId: row.businessId,
      businessName: row.business?.name ?? null,
      alreadyReversed: Boolean(row.reversedByPlatformEntry),
      amount: lineAmount(row.lines),
      lines: row.lines.map((ln) => ({
        code: ln.chartOfAccount.code,
        name: ln.chartOfAccount.name,
        debit: ln.debitAmount.toString(),
        credit: ln.creditAmount.toString(),
        description: ln.description,
      })),
    }))
    .filter((r) => amountMatches(r.amount, args.amount));
}

async function findMerchantMatches(args: Args, platformIds: string[]): Promise<MerchantMatch[]> {
  if (args.merchantJournalId) {
    const row = await prisma.journalEntry.findUnique({
      where: { id: args.merchantJournalId },
      include: {
        lines: { include: { chartOfAccount: { select: { code: true, name: true } } } },
        reversedByEntry: { select: { id: true } },
        business: { select: { id: true, name: true } },
      },
    });
    if (!row) return [];
    return [
      {
        id: row.id,
        memo: row.memo,
        reference: row.reference,
        postedAt: row.postedAt,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        businessId: row.businessId,
        businessName: row.business.name,
        alreadyReversed: Boolean(row.reversedByEntry || row.reversesJournalEntryId),
        amount: lineAmount(row.lines),
        lines: row.lines.map((ln) => ({
          code: ln.chartOfAccount.code,
          name: ln.chartOfAccount.name,
          debit: ln.debitAmount.toString(),
          credit: ln.creditAmount.toString(),
          description: ln.description,
        })),
      },
    ];
  }

  const or: Prisma.JournalEntryWhereInput[] = [];
  if (platformIds.length) {
    or.push({ sourceId: { in: platformIds } });
  }
  if (args.reference) {
    or.push({ reference: { equals: args.reference, mode: "insensitive" } });
  }
  if (args.memoContains) {
    or.push({ memo: { contains: args.memoContains, mode: "insensitive" } });
  }
  if (!or.length && !args.merchantContains) {
    return [];
  }

  const where: Prisma.JournalEntryWhereInput = {
    reversesJournalEntryId: null,
    sourceType: {
      in: [JournalSourceType.PLATFORM_FUND_TRANSFER, JournalSourceType.PLATFORM_FUND_TRANSFER_REVERSAL],
    },
    ...(or.length ? { OR: or } : {}),
    ...(args.merchantContains
      ? { business: { name: { contains: args.merchantContains, mode: "insensitive" } } }
      : {}),
  };

  const rows = await prisma.journalEntry.findMany({
    where,
    include: {
      lines: { include: { chartOfAccount: { select: { code: true, name: true } } } },
      reversedByEntry: { select: { id: true } },
      business: { select: { id: true, name: true } },
    },
    orderBy: { postedAt: "desc" },
    take: 50,
  });

  return rows
    .map((row) => ({
      id: row.id,
      memo: row.memo,
      reference: row.reference,
      postedAt: row.postedAt,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      businessId: row.businessId,
      businessName: row.business.name,
      alreadyReversed: Boolean(row.reversedByEntry),
      amount: lineAmount(row.lines),
      lines: row.lines.map((ln) => ({
        code: ln.chartOfAccount.code,
        name: ln.chartOfAccount.name,
        debit: ln.debitAmount.toString(),
        credit: ln.creditAmount.toString(),
        description: ln.description,
      })),
    }))
    .filter((r) => amountMatches(r.amount, args.amount));
}

function printMatch(kind: "platform" | "merchant", m: PlatformMatch | MerchantMatch) {
  console.log(`\n[${kind}] ${m.id}`);
  console.log(`  business: ${m.businessName ?? "?"} (${"businessId" in m ? m.businessId : ""})`);
  console.log(`  postedAt: ${m.postedAt.toISOString()}`);
  console.log(`  sourceType: ${m.sourceType}`);
  console.log(`  reference: ${m.reference}`);
  console.log(`  memo: ${m.memo}`);
  console.log(`  amount: ${money(m.amount)}`);
  console.log(`  alreadyReversed: ${m.alreadyReversed}`);
  for (const ln of m.lines) {
    console.log(`    ${ln.code} (${ln.name}) Dr ${ln.debit} Cr ${ln.credit} — ${ln.description ?? ""}`);
  }
}

async function reverseMerchantOnly(
  merchant: MerchantMatch,
  postedAt: Date,
): Promise<{ reversalId: string | null }> {
  // Prefer sourceId (= platform journal id when posted via settlement/fund transfer).
  if (merchant.sourceId) {
    const result = await prisma.$transaction(async (tx) => {
      const rev = await reverseMerchantJournalForPlatformFundTransfer(tx, merchant.sourceId!, postedAt);
      await reopenSettlementRequestForReversedJournal(tx, merchant.sourceId!);
      // Also reopen by ticketing ref if platform journal already gone.
      if (merchant.reference) {
        await tx.merchantSettlementRequest.updateMany({
          where: {
            ticketingRef: merchant.reference,
            status: MerchantSettlementRequestStatus.COMPLETED,
            businessId: merchant.businessId,
          },
          data: {
            status: MerchantSettlementRequestStatus.OPEN,
            platformJournalId: null,
            completedAt: null,
            completedByUserId: null,
          },
        });
      }
      return rev;
    });
    return { reversalId: result?.id ?? null };
  }

  // Fallback: reverse by merchant journal id directly.
  const reversalId = await prisma.$transaction(async (tx) => {
    const original = await tx.journalEntry.findUnique({
      where: { id: merchant.id },
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
          : `Reversal of wrong DirectPay settlement (${original.id})`,
        reference: original.reference,
        sourceType: JournalSourceType.PLATFORM_FUND_TRANSFER_REVERSAL,
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
              : "Reversal of DirectPay settlement line",
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
        type: SalesLedgerEntryType.PLATFORM_FUND_TRANSFER,
        status: SalesLedgerStatus.SUCCEEDED,
      },
      data: { status: SalesLedgerStatus.REVERSED },
    });
    if (original.reference) {
      await tx.merchantSettlementRequest.updateMany({
        where: {
          ticketingRef: original.reference,
          status: MerchantSettlementRequestStatus.COMPLETED,
          businessId: original.businessId,
        },
        data: {
          status: MerchantSettlementRequestStatus.OPEN,
          platformJournalId: null,
          completedAt: null,
          completedByUserId: null,
        },
      });
    }
    return reversal.id;
  });
  return { reversalId };
}

async function wipeMatched(platform: PlatformMatch | null, merchant: MerchantMatch | null) {
  await prisma.$transaction(async (tx) => {
    const merchantIds = new Set<string>();
    const platformIds = new Set<string>();
    if (merchant) merchantIds.add(merchant.id);
    if (platform) platformIds.add(platform.id);

    if (platform?.id) {
      const linkedMerchant = await tx.journalEntry.findMany({
        where: {
          OR: [
            { sourceId: platform.id },
            ...(platform.sourceId ? [{ id: platform.sourceId }] : []),
          ],
        },
        select: { id: true, reversesJournalEntryId: true },
      });
      for (const j of linkedMerchant) {
        merchantIds.add(j.id);
        if (j.reversesJournalEntryId) merchantIds.add(j.reversesJournalEntryId);
      }
      const platRevs = await tx.platformJournalEntry.findMany({
        where: {
          OR: [{ id: platform.id }, { reversesPlatformJournalEntryId: platform.id }],
        },
        select: { id: true },
      });
      for (const j of platRevs) platformIds.add(j.id);
    }

    if (merchant?.id) {
      const revs = await tx.journalEntry.findMany({
        where: {
          OR: [{ id: merchant.id }, { reversesJournalEntryId: merchant.id }],
        },
        select: { id: true },
      });
      for (const j of revs) merchantIds.add(j.id);
      if (merchant.sourceId) {
        const plats = await tx.platformJournalEntry.findMany({
          where: {
            OR: [{ id: merchant.sourceId }, { reversesPlatformJournalEntryId: merchant.sourceId }],
          },
          select: { id: true },
        });
        for (const j of plats) platformIds.add(j.id);
      }
    }

    const mIds = [...merchantIds];
    const pIds = [...platformIds];

    if (mIds.length) {
      await tx.salesLedgerEntry.deleteMany({ where: { journalEntryId: { in: mIds } } });
      await tx.journalEntry.updateMany({
        where: { id: { in: mIds }, reversesJournalEntryId: { not: null } },
        data: { reversesJournalEntryId: null },
      });
      await tx.journalLine.deleteMany({ where: { journalEntryId: { in: mIds } } });
      await tx.journalEntry.deleteMany({ where: { id: { in: mIds } } });
    }

    if (pIds.length) {
      await tx.merchantSettlementRequest.updateMany({
        where: { platformJournalId: { in: pIds } },
        data: {
          status: MerchantSettlementRequestStatus.OPEN,
          platformJournalId: null,
          completedAt: null,
          completedByUserId: null,
        },
      });
      await tx.platformJournalEntry.updateMany({
        where: { id: { in: pIds }, reversesPlatformJournalEntryId: { not: null } },
        data: { reversesPlatformJournalEntryId: null },
      });
      await tx.platformJournalLine.deleteMany({ where: { journalEntryId: { in: pIds } } });
      await tx.platformJournalEntry.deleteMany({ where: { id: { in: pIds } } });
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(
    `[settlement-fix] mode=${args.apply ? "APPLY" : "DRY-RUN"} wipe=${args.wipe} notify=${args.notify}`,
  );
  console.log(
    `[settlement-fix] filters reference=${args.reference ?? "-"} amount=${args.amount ? money(args.amount) : "-"} ` +
      `memoContains=${args.memoContains ?? "-"} merchantContains=${args.merchantContains ?? "-"} ` +
      `platformId=${args.platformJournalId ?? "-"} merchantId=${args.merchantJournalId ?? "-"}`,
  );

  if (!hasStrongFilter(args)) {
    throw new Error(
      "Refusing to run without a filter. Pass --reference=DPAY-12 and/or --amount=48900 and/or --memo-contains=BarakahFunds (or an explicit journal id).",
    );
  }

  const platforms = await findPlatformMatches(args);
  const merchants = await findMerchantMatches(
    args,
    platforms.map((p) => p.id),
  );

  // If merchant-only search (platform wiped earlier), also try ticketing ref settlement.
  if (!platforms.length && !merchants.length && args.reference) {
    const req = await prisma.merchantSettlementRequest.findFirst({
      where: { ticketingRef: { equals: args.reference, mode: "insensitive" } },
      include: { business: { select: { name: true } } },
    });
    if (req) {
      console.log(
        `[settlement-fix] Found settlement request ${req.id} status=${req.status} ` +
          `business=${req.business.name} amount=${money(req.amount)} platformJournalId=${req.platformJournalId}`,
      );
    }
  }

  console.log(`[settlement-fix] platform matches: ${platforms.length}`);
  for (const p of platforms) printMatch("platform", p);
  console.log(`[settlement-fix] merchant matches: ${merchants.length}`);
  for (const m of merchants) printMatch("merchant", m);

  if (!platforms.length && !merchants.length) {
    console.log("\nNo matching journals found on this DATABASE_URL. Point .env at live and re-run dry-run.");
    return;
  }

  if (platforms.length > 1 || merchants.length > 1) {
    throw new Error(
      `Ambiguous match (platform=${platforms.length}, merchant=${merchants.length}). Narrow filters or pass --platform-journal-id / --merchant-journal-id.`,
    );
  }

  const platform = platforms[0] ?? null;
  const merchant =
    merchants[0] ??
    (platform?.sourceId
      ? (await findMerchantMatches({ ...args, merchantJournalId: platform.sourceId }, []))[0] ?? null
      : null);

  if (!args.apply) {
    console.log("\nDry-run only. Re-run with --apply to reverse.");
    console.log("  --apply           reverse platform + merchant settlement journals");
    console.log("  --apply --wipe    reverse then hard-delete those journals");
    console.log("  --no-notify       skip owner push on reverse");
    return;
  }

  let platformReversalId: string | null = null;
  let merchantReversalId: string | null = null;

  if (platform && !platform.alreadyReversed) {
    if (platform.sourceType !== PlatformJournalSourceType.MERCHANT_FUND_TRANSFER) {
      throw new Error(`Platform journal ${platform.id} is ${platform.sourceType}, not MERCHANT_FUND_TRANSFER.`);
    }
    const reversal = await reversePlatformJournalEntry(platform.id, {
      postedAt: args.postedAt,
      memo: `Script cleanup — reverse wrong settlement (${platform.reference ?? platform.id})`,
    });
    platformReversalId = reversal.id;
    console.log(`[settlement-fix] Reversed platform journal → ${platformReversalId}`);
    // reversePlatformJournalEntry already reverses merchant + reopens settlement + notifies.
    if (!args.notify) {
      console.log("[settlement-fix] Note: notify already fired from reversePlatformJournalEntry path.");
    }
  } else if (platform?.alreadyReversed) {
    console.log(`[settlement-fix] Platform journal already reversed: ${platform.id}`);
  }

  // Merchant-only orphan (platform wiped earlier) or platform reverse did not find merchant.
  if (merchant && !merchant.alreadyReversed) {
    const stillOpen = await prisma.journalEntry.findUnique({
      where: { id: merchant.id },
      include: { reversedByEntry: { select: { id: true } } },
    });
    if (stillOpen && !stillOpen.reversedByEntry) {
      const postedAt = new Date(`${args.postedAt}T12:00:00.000Z`);
      const { reversalId } = await reverseMerchantOnly(merchant, postedAt);
      merchantReversalId = reversalId;
      console.log(`[settlement-fix] Reversed merchant journal → ${merchantReversalId}`);
      if (args.notify && merchantReversalId) {
        void notifyBusinessOwnersOfFundTransfer({
          businessId: merchant.businessId,
          transferId: merchantReversalId,
          amount: merchant.amount,
          currency: "GMD",
          kind: "reversed",
        });
      }
    } else {
      console.log(`[settlement-fix] Merchant journal already reversed: ${merchant.id}`);
    }
  } else if (merchant?.alreadyReversed) {
    console.log(`[settlement-fix] Merchant journal already reversed: ${merchant.id}`);
  }

  if (args.wipe) {
    await wipeMatched(platform, merchant);
    console.log("[settlement-fix] Wiped matched platform/merchant journals (and linked sales ledger rows).");
  }

  console.log("\n[settlement-fix] Done.");
  console.log(`  platformReversalId: ${platformReversalId ?? "-"}`);
  console.log(`  merchantReversalId: ${merchantReversalId ?? "-"}`);
}

main()
  .catch((err) => {
    console.error("[settlement-fix] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
