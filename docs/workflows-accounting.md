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
- Used for subscription revenue recognition, refunds, platform wallet fees, and **aggregator self-settlement** — **not** mixed with tenant `ChartOfAccount` rows.
- Self-settlement on Wave payout success (`WAVE_SELF_SETTLEMENT`): **Dr P-4920** (payout + Wave fee) · **Cr P-1200** (aggregator Wave clearing); **Dr P-1200** · **Cr P-4010** (withhold revenue). The merchant is stored on `PlatformJournalEntry.businessId`. A local `WaveOpsPayout` row is created so the payout appears in Wave Operations like supplier payouts.
- Self-settlement on Wave payout reverse (`WAVE_SELF_SETTLEMENT_REVERSAL`): Wave returns the payout **including fees**. DirectPay swaps every line of the original platform journal (undo P-4920 cost, P-4010 withhold, P-1200 clearing) and reverses the merchant reserved checkout-fee journal (`CUSTOMER_SALE_SELF_SETTLEMENT_CHECKOUT_FEE` / sales ledger `SELF_SETTLEMENT_CHECKOUT_FEE`). The original customer-sale journal is left unchanged. Detection is Wave payout poll, Wave Operations payout refresh, or `api_payout_reversal` on the transaction list — not the Wave Operations reverse button.
- Wave Operations supplier payouts (`WAVE_OPS_PAYOUT`): standalone single or bulk payouts (not self-settlement, not bill-linked) post **Dr P-4930** (receive + Wave fee) · **Cr P-1200** (aggregator Wave clearing). The supplier name is on the journal memo. Bill-linked payouts keep `PURCHASE_BILL_PAYMENT` only. Self-settlement keeps `WAVE_SELF_SETTLEMENT`.
- Wave Operations supplier payout reverse (`WAVE_OPS_PAYOUT_REVERSAL`): swaps the original P-4930 / P-1200 lines after Wave reports reversed (Ops reverse button, payout refresh, or batch/list sync).

## Platform reports

- **`platform-accounting-reports.service.ts`** — Platform GL, profit-and-loss, and statement-style reports for platform UI.

When documenting **which ledger** a transaction hits, always state **business** vs **platform**.
