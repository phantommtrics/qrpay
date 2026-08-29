# Backend components

## Entry and HTTP server

- **`backend/src/server.ts`** — Starts the HTTP server (listens on configured port).
- **`backend/src/app.ts`** — Express application: CORS, JSON body, **all route registrations** (very large file by design).

## Middleware and auth

| File | Role |
|------|------|
| `middleware/jwt.ts` | `authenticateToken`, `optionalAuthenticateToken`, platform operator helpers |
| Route-level guards | `requireEntitlement("slug")`, `requireAnyEntitlement([...])`, `requirePlatformOwner`, etc. |

Authenticated business routes expect:

- `Authorization: Bearer <jwt>`
- `x-business-id: <businessId>` for tenant-scoped operations

## Error handling

- **`lib/http-error.ts`** — `HttpError` with status code and message; mapped to JSON error responses for the client.

## Core services (by domain)

Services live under **`backend/src/services/`**. The following map is representative (not every export).

### Identity and tenants

- **`auth.service.ts`** — Login, register business owner, password flows, business user listing.
- **`membership-status.service.ts`**, **`membership-access.service.ts`** — Membership state and access.
- **`staff-invite.service.ts`** — Inviting staff (emails / notification logs).

### Platform catalog and security

- **`system-catalog.service.ts`** — System products/services, plan entitlements.
- **`business-user-access.service.ts`** — Which system products a business user may use.
- **`entitlement.service.ts`** — Effective entitlements for navigation and API checks.
- **`platform-security.service.ts`** — Platform roles, function groups, templates, platform staff users.
- **`platform-admin.service.ts`** — Paginated businesses, subscriptions, invoices for platform UI.
- **`platform-module-sync.service.ts`**, **`platform-modules.ts` (config)** — Module slugs.

### Subscriptions and platform billing

- **`subscription.service.ts`** — Plans, trials, renewals, subscription invoices, `payInvoice` (business owner paying EasyPay).
- **`subscription-invoice-checkout.service.ts`** — Hosted checkout for **subscription** invoices (platform credentials / gateway config).
- **`billing-ledger.service.ts`**, **`billing-ledger-report.service.ts`** — Platform billing ledger rows.
- **`wave-subscription-webhook.service.ts`**, **`yonna-subscription-webhook.service.ts`** — Subscription payment completion.
- **`subscription-invoice-email.service.ts`**, **`subscription-invoice-pdf.service.ts`** — PDFs and emails.
- **`subscription-refund-review-email.service.ts`** — Refund review communications.

### Payment infrastructure (catalog + credentials)

- **`payment-gateway.service.ts`** — CRUD for global `PaymentGateway` definitions (platform).
- **`business-payment-method.service.ts`** — Which gateways a business enabled.
- **`business-gateway-credential.service.ts`** — Encrypted storage of **merchant** Wave/Yonna secrets (Merchant API UI).

### Merchant commerce (POS)

- **`product.service.ts`**, **`menu-category.service.ts`**
- **`dining-table.service.ts`**
- **`sale.service.ts`** — Orders, payments, cash/wallet completion, receipts, **public pay** info, simulator webhook.
- **`order-wallet-checkout.service.ts`** — Wave/Yonna session creation for **orders** and **sales invoices**. Wave uses the business’s own API key when stored, otherwise platform `WAVE_CHECKOUT_BEARER` + per-business aggregated merchant id; Yonna uses business decrypted credentials.
- **`sale-accounting.service.ts`**, **`merchant-pos-wallet-fee-resolution.service.ts`** — Customer sale journals and wallet fees.

### Restaurant (public)

- **`restaurant-public.service.ts`** — Guest menu payload, anonymous guest orders.
- **`restaurant-guard.service.ts`** — Business-level restaurant toggles / checks.

### Sales documents (CRM + accounting)

- **`business-contact.service.ts`** — Contacts for quotations/invoices.
- **`sales-quotation.service.ts`**, **`sales-invoice.service.ts`** — Draft/send/approve/void/paid flows.
- **`sales-public.service.ts`** — **Guest token** quotation and invoice APIs (no auth).
- **`sales-document-pdf.service.ts`**, **`sales-document-api-format.ts`**, **`sales-document-code.service.ts`**
- **`sales-quotation-email.service.ts`**, **`sales-invoice-email.service.ts`**
- **`sales-settlement-account.service.ts`** — Default settlement account resolution for sales invoices.

### Business accounting

- **`chart-of-accounts.service.ts`**, **`manual-journal.service.ts`**
- **`accounting-reports.service.ts`**, **`accounting-summary.service.ts`**
- **`platform-chart-of-accounts.service.ts`**, **`platform-journal.service.ts`**, **`platform-accounting-reports.service.ts`**, **`platform-subscription-journal.service.ts`**

### Payment provider integrations

- **`wave-payment.service.ts`**, **`yonna-forex-payment.service.ts`** — Low-level API calls.

## Public API surface (examples)

Prefixes are under **`/api`** (exact paths in `app.ts`):

- **`/api/public/...`** — Guest menu, guest orders, public pay, guest quotation/invoice, product public page, etc.
- **`/api/businesses/:businessId/...`** — Authenticated tenant operations (orders, products, accounting, sales, …).
- **`/api/platform/...`** — Platform owner / operator routes (businesses, gateways, security, platform accounting).

## Configuration

- **`backend/src/config/env.ts`** — Environment variables (e.g. `DATABASE_URL`, `RESEND_*`, JWT secrets).
- **`backend/src/config/app-public-url.ts`** — Public base URL for return URLs (Wave success, etc.).
- **`backend/src/config/payment-provider-env.ts`** — Provider API base URLs.
