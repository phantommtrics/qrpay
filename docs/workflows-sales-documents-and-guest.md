# Workflow: Sales quotations, invoices, and guest links

## Quotation (merchant → contact)

1. **Draft** — Created from **`BusinessContact`** + lines (chart of account per line).
2. **Send** — Moves to **`SENT`**, assigns **`guestToken`**, emails PDF + portal link (`sales-quotation-email.service.ts`); `queueSalesQuotationSentEmail`.
3. **Guest** — `GET /api/public/guest/quotation/:token` shows document; **`POST .../respond`** with `accept` or `reject`.
   - **Accept** — Creates a **draft `SalesInvoice`** linked via `sourceQuotationId`, marks quotation **ACCEPTED**.
   - **Reject** — Quotation **REJECTED**.

Frontend routes: **`/guest/quotation/:guestToken`**.

## Invoice (merchant → contact)

1. **Draft** — Manual creation or from accepted quotation.
2. **Approve** — Moves to **`APPROVED`**, ensures **`guestToken`**, emails PDF + portal link (`sales-invoice-email.service.ts`); `queueSalesInvoiceApprovedEmail`.
3. **Guest** — `GET /api/public/guest/invoice/:token` shows document; **Pay** uses **same wallet list** as POS (`listOrderCheckoutWallets` + `startGatewayWalletCheckoutForInvoice`).
4. **Paid** — When wallet payment **`COMPLETED`**, **`markSalesInvoicePaidWithWalletPayment`** posts **`SALES_INVOICE_PAYMENT`** journal (cash-basis) and sets invoice **`PAID`** + `journalEntryId`.

Frontend routes: **`/guest/invoice/:guestToken`**.

## PDFs

- Generated server-side (`sales-document-pdf.service.ts`); download endpoints are authenticated for staff; emails attach PDFs for send/approve flows.

## Guest pay vs platform subscription

- Guest invoice wallet uses **merchant** `BusinessGatewayCredential` for Wave/Yonna (see `order-wallet-checkout.service.ts` → `startGatewayWalletCheckoutForInvoice`).
- Success return URLs point at **`/pay/:publicToken`** on the **public app** base URL so **`completeWalletPaymentByPublicToken`** can finalize and post to the **business** ledger.

## Ledger impact

- **Approved** alone does not post full GL for cash-basis sales invoices; **paid** (via staff mark-paid or wallet completion) triggers **`postMoneyInJournalForSalesInvoice`** / related helpers in `sales-invoice.service.ts`.
