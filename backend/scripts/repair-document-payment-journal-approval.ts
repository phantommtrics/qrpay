/**
 * Backfill: cash-basis bill/invoice payment journals were posted without
 * journalApprovalExempt, so GL / account statements excluded their DR/CR.
 *
 * Usage (from backend/):
 *   npx tsx scripts/repair-document-payment-journal-approval.ts
 *   npx tsx scripts/repair-document-payment-journal-approval.ts --apply
 */
import "dotenv/config";
import { JournalSourceType, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes("--apply");
  const where = {
    sourceType: {
      in: [JournalSourceType.PURCHASE_BILL_PAYMENT, JournalSourceType.SALES_INVOICE_PAYMENT],
    },
    journalApprovalExempt: false,
    approvedAt: null,
    cancelledAt: null,
  } as const;

  const count = await prisma.journalEntry.count({ where });
  console.log(
    `[repair-doc-payment-journals] mode=${apply ? "APPLY" : "DRY-RUN"} matching=${count}`,
  );

  if (!count) {
    console.log("Nothing to repair.");
    return;
  }

  const sample = await prisma.journalEntry.findMany({
    where,
    select: {
      id: true,
      sourceType: true,
      memo: true,
      business: { select: { name: true } },
    },
    take: 20,
    orderBy: { postedAt: "desc" },
  });
  for (const row of sample) {
    console.log(
      `  - ${row.sourceType} ${row.id.slice(0, 10)}… biz=${row.business.name} memo=${(row.memo ?? "").slice(0, 60)}`,
    );
  }
  if (count > sample.length) console.log(`  … and ${count - sample.length} more`);

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to set journalApprovalExempt=true.");
    return;
  }

  const updated = await prisma.journalEntry.updateMany({
    where,
    data: { journalApprovalExempt: true },
  });
  console.log(`Updated ${updated.count} journal(s). GL / account statements will now include their lines.`);
}

main()
  .catch((err) => {
    console.error("[repair-doc-payment-journals] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
