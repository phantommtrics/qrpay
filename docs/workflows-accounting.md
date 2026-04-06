# Workflow: Accounting (merchant and platform)

## Merchant accounting

- **`ChartOfAccount`** — Tenant-specific accounts; categories ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE; kinds LEDGER vs BANK.
- **`JournalEntry` / `JournalLine`** — General ledger postings; `JournalSourceType` includes customer sales, sales invoice payments, manual money in/out, bank transfers.
- **Manual journals** — `manual-journal.service.ts`; UI under Accounting → Journals (where entitled).

## Reports

- **GL balance, profit-and-loss, account statements** — `accounting-reports.service.ts`; frontend screens under `/accounting/reports/*`.
- **Balance sheet / summary** — `accounting-summary.service.ts` where exposed.

## Sales-linked posting

- **POS / order wallet or cash** — Customer sale payment and ledger entries via `sale-accounting.service.ts` (and related).
- **Sales invoice paid** — `SALES_INVOICE_PAYMENT` source; see `sales-invoice.service.ts` and `postMoneyInJournalForSalesInvoice`.

## Platform accounting

- **Separate** chart and journals for the **operator** (`platform-chart-of-accounts.service.ts`, `platform-journal.service.ts`, `platform-subscription-journal.service.ts`).
- Used for subscription revenue recognition, refunds, platform wallet fees — **not** mixed with tenant `ChartOfAccount` rows.

## Platform reports

- **`platform-accounting-reports.service.ts`** — Platform GL, profit-and-loss, and statement-style reports for platform UI.

When documenting **which ledger** a transaction hits, always state **business** vs **platform**.
