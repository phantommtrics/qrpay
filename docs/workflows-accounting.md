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
- **Wave checkout refund** — `Payment.status` becomes `REVERSED` and merchant journals for `CUSTOMER_SALE`, `WALLET_FEE`, and reserved `SELF_SETTLEMENT_CHECKOUT_FEE` are reversed (swapped-line journals; sales-ledger rows `REVERSED`). Sales reports already exclude `SUCCEEDED`-only rows. Historical refunds are backfilled on self-settlement worker startup (`backfillMerchantLedgersForReversedPayments`); reversal `postedAt` uses `payment.reversedAt`.
- **Wave self-settlement payout (merchant books)** — On payout success, `WAVE_SELF_SETTLEMENT_PAYOUT` / sales ledger `SETTLEMENT_PAYOUT`: **Dr MOBILE_MONEY** (receive) · **Cr MERCHANT_WALLET_CLEARING**; **Dr QR_WALLET_FEES** (withhold + Wave payout fee) · **Cr MERCHANT_WALLET_CLEARING**. Platform withhold remains revenue on operator GL (`P-4010`). Payout reverse swaps the merchant settlement journal (`WAVE_SELF_SETTLEMENT_PAYOUT_REVERSAL`) and still reverses the reserved checkout fee. Past succeeded/reversed self-settlements are backfilled without owner push.
- **Wave Operations payout on a business merchant id** — Platform expense (`WAVE_OPS_PAYOUT`: **Dr P-4930** receive + Wave fee · **Cr P-1200**). Merchant money in (`WAVE_OPS_MERCHANT_PAYOUT` / sales ledger `WAVE_OPS_PAYOUT` MONEY_IN): **Dr WAVE_MERCHANT_PAYOUTS** (asset) · **Cr other revenue (260)** for the **net receive** after Wave's payout fee. The fee stays on platform books only. The journal posts to the Easypay business linked to that Wave aggregated merchant id. Platform-aggregator-only payouts have no merchant journal. Historical ops payouts without stored `aggregatedMerchantId` are not guessed.

## Owner notifications

- POS/order checkout still sends Web Push to business owners (`notifyBusinessOwnersOfPayment`).
- Self-settlement success and Wave Ops payouts attributed to a linked business merchant send `notifyBusinessOwnersOfPayout` (bulk: one summary per business). Backfills never send push.
- Platform admin bank / manual fund transfers send `notifyBusinessOwnersOfFundTransfer`. Reversing that transfer sends another owner push (`kind: reversed`).

## Platform accounting

- **Separate** chart and journals for the **operator** (`platform-chart-of-accounts.service.ts`, `platform-journal.service.ts`, `platform-subscription-journal.service.ts`).
- Used for subscription revenue recognition, refunds, platform wallet fees, and **aggregator self-settlement** — **not** mixed with tenant `ChartOfAccount` rows.
- Self-settlement on Wave payout success (`WAVE_SELF_SETTLEMENT`): **Dr P-4920** (payout + Wave fee) · **Cr P-1200** (aggregator Wave clearing); **Dr P-1200** · **Cr P-4010** (withhold revenue). The merchant is stored on `PlatformJournalEntry.businessId`. A local `WaveOpsPayout` row is created so the payout appears in Wave Operations like supplier payouts.
- Self-settlement on Wave payout reverse (`WAVE_SELF_SETTLEMENT_REVERSAL`): Wave returns the payout **including fees**. DirectPay swaps every line of the original platform journal (undo P-4920 cost, P-4010 withhold, P-1200 clearing), reverses the merchant reserved checkout-fee journal (`CUSTOMER_SALE_SELF_SETTLEMENT_CHECKOUT_FEE` / sales ledger `SELF_SETTLEMENT_CHECKOUT_FEE`), and reverses the merchant settlement journal (`WAVE_SELF_SETTLEMENT_PAYOUT`) when it exists. Checkout **refunds** reverse the original customer-sale and wallet-fee journals on the merchant books. Detection is Wave payout poll, Wave Operations payout refresh, or `api_payout_reversal` on the transaction list — not the Wave Operations reverse button.
- Wave Operations supplier payouts (`WAVE_OPS_PAYOUT`): standalone single or bulk payouts (not self-settlement, not bill-linked) post **Dr P-4930** (receive + Wave fee) · **Cr P-1200** (aggregator Wave clearing). The supplier name is on the journal memo. Bill-linked payouts keep `PURCHASE_BILL_PAYMENT` only. Self-settlement keeps `WAVE_SELF_SETTLEMENT`.
- Wave Operations supplier payout reverse (`WAVE_OPS_PAYOUT_REVERSAL`): swaps the original P-4930 / P-1200 lines after Wave reports reversed (Ops reverse button, payout refresh, or batch/list sync).
- **Platform admin fund transfer (no Wave payout)** — When a merchant is settled by bank (or Wave payout cannot run), operator journals **Transfer funds to a merchant** posts `MERCHANT_FUND_TRANSFER`: **Dr P-4940** · **Cr** a platform account the admin selects (default P-1200). Merchant books (`PLATFORM_FUND_TRANSFER` / sales ledger `PLATFORM_FUND_TRANSFER` MONEY_IN): **Dr PLATFORM_FUND_TRANSFERS** (dedicated asset) · **Cr other revenue (260)**. Owners receive Web Push (`notifyBusinessOwnersOfFundTransfer`). Reversing the platform entry also reverses the merchant journal (`MERCHANT_FUND_TRANSFER_REVERSAL` / `PLATFORM_FUND_TRANSFER_REVERSAL`) and sends a second owner push. No `WaveOpsPayout` row is created.

## Platform reports

- **`platform-accounting-reports.service.ts`** — Platform GL, profit-and-loss, and statement-style reports for platform UI.

When documenting **which ledger** a transaction hits, always state **business** vs **platform**.
