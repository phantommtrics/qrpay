# Workflow: Subscriptions and platform billing

This document describes **EasyPay (platform) charging merchants** for **plans**. It is **not** about end-customer payments to merchants (orders/sales invoices).

## Concepts

- **`Subscription`** — One per business (current model); status drives access and billing.
- **`SubscriptionInvoice`** — Platform invoice rows (PENDING, PAID, FAILED, VOID).
- **`BillingLedgerEntry`** — Platform ledger: money in (subscription payment), refunds, adjustments, wallet rail fees.

## Merchant-facing billing UI

- Businesses open **Billing** / **Subscription invoices** in the web app to see invoices and pay the platform.
- Checkout flows use **platform-configured** gateways and webhooks (`subscription-invoice-checkout.service.ts`, `wave-subscription-webhook.service.ts`, `yonna-subscription-webhook.service.ts`).

## Platform owner

- Lists businesses, subscriptions, invoices; may review billing and refunds (see **`platform-admin.service.ts`** and **`docs/platform-admin.md`**).
- **Platform accounting** (separate chart) is for the operator’s books, not tenant merchants.

## Email and PDF

- Subscription invoices can be emailed with PDF attachments (`subscription-invoice-email.service.ts`, `subscription-invoice-pdf.service.ts`).
- Refund review and approval emails have dedicated notification types.

## Separation from merchant customer money

| Concern | Models / services |
|--------|-------------------|
| Merchant pays EasyPay | `SubscriptionInvoice`, `BillingLedgerEntry`, subscription webhooks |
| Customer pays merchant | `Order`, `Payment`, `Receipt`, `SalesInvoice` + merchant gateway credentials |

Do not confuse **subscription** gateway env with **merchant** `BusinessGatewayCredential` used for POS and guest invoice wallet pay.
