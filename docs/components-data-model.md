# Data model (Prisma / PostgreSQL)

Schema file: **`backend/prisma/schema.prisma`**. This section summarizes major models and how they relate.

## Multi-tenancy

- **`Business`** — Tenant root: name, slug, owner email, relations to products, orders, subscriptions, chart of accounts, etc.
- **`BusinessMembership`** — Links **`User`** to **`Business`** with role (`ADMIN`, `MERCHANT`, `CASHIER`, …) and status.
- **`User`** — `UserRole` includes `PLATFORM_OWNER`, `PLATFORM_ADMIN`, merchant roles, `CUSTOMER`.

## Platform subscriptions (EasyPay ↔ merchant)

- **`Plan`** / **`PlanCode`** — BASIC, PRO, BUSINESS_PRO.
- **`Subscription`** — Business subscription state (`SubscriptionStatus`: TRIALING, ACTIVE, PAST_DUE, …).
- **`SubscriptionInvoice`** — Invoices for the **subscription** (platform billing), `InvoiceStatus`, not the same as merchant sales invoices.
- **`BillingLedgerEntry`** — Platform billing ledger (money in/out, wallet fees, refunds metadata).

## Merchant commerce

- **`Product`**, **`MenuCategory`** — Catalog; restaurant uses categories and products on guest menu.
- **`DiningTable`** — Table label, `publicToken` for guest QR URLs.
- **`Order`**, **`OrderLine`** — `OrderStatus`: PENDING_PAYMENT, PAID, CANCELLED.
- **`Payment`** — `method` QR_WALLET or CASH; `provider` SIMULATOR, WAVE_GAMBIA, YONNA_WALLET, etc.; `publicToken` for customer return URL; **`orderId`** optional, **`salesInvoiceId`** optional (invoice wallet pay).
- **`Receipt`** — Issued when an order is settled (cash or completed wallet).

## Sales documents (merchant ↔ contact)

- **`BusinessContact`** — Customer/contact for quotations and invoices.
- **`SalesQuotation`** — `SalesQuotationStatus` (DRAFT, SENT, ACCEPTED, REJECTED); optional **`guestToken`** for public link after send.
- **`SalesQuotationLine`** — Lines tied to **chart of account** (revenue classification).
- **`SalesInvoice`** — `SalesInvoiceStatus` (DRAFT, APPROVED, PAID, VOID); optional **`guestToken`** for public view/pay; **`journalEntryId`** when paid and posted (cash-basis).
- **`SalesInvoiceLine`** — Same pattern as quotation lines.

## Accounting (merchant)

- **`ChartOfAccount`** — Category (ASSET, LIABILITY, …), kind (LEDGER vs BANK), codes, names.
- **`JournalEntry`**, **`JournalLine`** — General ledger; `JournalSourceType` includes `CUSTOMER_SALE_PAYMENT`, `SALES_INVOICE_PAYMENT`, manual types.
- **`SalesLedgerEntry`** — Auxiliary sales ledger for customer sales / wallet fees.

## Platform accounting (separate)

- **`PlatformChartOfAccount`**, platform journal models — Used for **platform** GL, not tenant GL (see schema relations and platform services).

## Notifications log

- **`StaffCreationNotificationLog`** — Audit of emails sent (invites, subscription PDFs, sales quotation/invoice emails); `StaffCreationNotificationType` enum.

## Payment infrastructure

- **`PaymentGateway`** — Global catalog (code, name, `checkoutAdapter`).
- **`BusinessPaymentMethod`** — Business enables a gateway.
- **`BusinessGatewayCredential`** — Encrypted ciphertext/IV per business+gateway for Wave/Yonna secrets.

## Enums (high level)

- **Money movement:** `PaymentStatus`, `PaymentMethod`, `PaymentProvider`.
- **Documents:** `SalesQuotationStatus`, `SalesInvoiceStatus`.
- **Accounting:** `ChartAccountCategory`, `ChartAccountKind`, `JournalSourceType`.

Migrations live in **`backend/prisma/migrations/`**; apply with Prisma migrate or equivalent SQL in each environment.
