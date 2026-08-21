# analytics-bi (biReports) — DirectPay API integration

Server-to-server integration between **analytics-bi** and **DirectPay** for tenant provisioning and platform subscription billing.

## analytics-bi setup (owner)

Each analytics-bi deployment allows **one organization**. The owner creates it under **Admin → Organizations**, then:

1. **Provision DirectPay** — creates a DirectPay business using the billing owner email/name
2. **Start Corporate plan** — starts platform subscription (trial + invoice)
3. **Pay in DirectPay** — use the **Pay in DirectPay** button (guest invoice link) or log into DirectPay as the billing owner

### How the owner pays

Subscription payment happens **in DirectPay**, not in analytics-bi:

| Method | Steps |
|--------|--------|
| **Guest pay link** | After starting subscription, click **Pay in DirectPay** on the Organization page (issues/returns a payable invoice and opens DirectPay in the browser) or use **Renew in DirectPay** on the subscription blocked screen |
| **DirectPay web app** | Log in to DirectPay with the **billing owner email** from org setup (DirectPay emails a temporary password when the Corporate plan is started; change password on first login). Open **Billing → Subscription invoices** and pay |
| **Invoice email** | DirectPay emails the subscription invoice PDF/link to the billing owner email when the Corporate plan is started |

Use the **same email** for analytics-bi billing owner and DirectPay login if the BI owner is also paying.

### Daily subscription reminders (short billing cycles)

When the current DirectPay billing period is **shorter than 30 days** (e.g. trial), analytics-bi emails the **billing owner once per day**:

| Mode | Schedule |
|------|----------|
| **Production** | Every day at **00:00** in `SUBSCRIPTION_REMINDER_TIMEZONE` (default `UTC`) |
| **Test** | `SUBSCRIPTION_REMINDER_TEST_MODE=true` — first email **2 minutes** after the API starts, then every `SUBSCRIPTION_REMINDER_TEST_DELAY_MS` (default `120000`) |

Requires `RESEND_API_KEY` / `RESEND_FROM` (or `MAIL_FALLBACK_CONSOLE=true` to log to the server console).

## Environment (analytics-bi backend)

```env
DIRECTPAY_API_BASE_URL=https://api.directpay.example.com
DIRECTPAY_INTERNAL_PARTNER_API_SECRET=<same as DirectPay INTERNAL_PARTNER_API_SECRET>
DIRECTPAY_PUBLIC_APP_URL=https://app.directpay.example.com
DIRECTPAY_WEBHOOK_SECRET=<same as DirectPay INTERNAL_PARTNER_WEBHOOK_SECRET>
```

## Provision (owner-only in analytics-bi admin)

**`POST /api/internal-partner/v1/provision`**

Body includes `partnerApp: "analytics-bi"`:

| Field | Required | Notes |
|-------|----------|-------|
| `externalUserId` | Yes | analytics-bi `Organization.id` (idempotency key) |
| `ownerEmail` | Yes | DirectPay billing owner email |
| `ownerName` | Yes | Billing contact name |
| `businessName` | Yes | Tenant display name |
| `slug` | No | URL slug hint |
| `industry` | No | Industry label |
| `webhookUrl` | No | Per-org webhook override |
| `partnerApp` | No | `"analytics-bi"` — platform billing, no comped subscription |

Unlike 7a-side (`partnerApp: "default"`), analytics-bi businesses have **`platformBillingWaived: false`** and **no automatic subscription**.

When the owner starts the **Corporate** plan, DirectPay sends the same emails as a self-serve Corporate signup:

- **Owner welcome email** — temporary password and guest pay link (when the first invoice has a balance)
- **Subscription invoice email** — PDF + pay link
- **Operator notify** — if `CORPORATE_SIGNUP_NOTIFY_EMAIL` is configured in DirectPay

Requires DirectPay `RESEND_API_KEY` / `RESEND_FROM_EMAIL`.

## Subscription (Corporate plan default)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/internal-partner/v1/businesses/:businessId/subscription` | Read status, period end, pending invoice, and billing assignment |
| `POST` | `/api/internal-partner/v1/businesses/:businessId/subscription` | Start subscription (defaults to `CORPORATE`) |
| `POST` | `/api/internal-partner/v1/businesses/:businessId/subscription/invoices` | Ensure a payable pending invoice exists; returns `pendingInvoice`, `payUrl` (hash route `/#/guest/subscription-invoice/:guestToken`), and `invoiceCreated` |

`POST .../subscription/invoices` is idempotent: if a pending invoice already exists, the same row and guest token are returned (`invoiceCreated: false`). Use this when the partner needs a fresh pay link on demand (e.g. **Pay in DirectPay** in analytics-bi).

### `billing` field (subscription revenue)

Every subscription response includes `billing` so the partner can tell what price is assigned after guest pay succeeds (pending invoices clear once paid):

| Shape | Meaning |
|-------|---------|
| `{ "assigned": false, "message": "No billing is assigned" }` | Corporate tenant has no billing template yet (invoice amount stays `0.00` until operators assign one) |
| `{ "assigned": true, "templateId", "templateName", "billingInterval", "currency", "amount", "prices" }` | Template is assigned; `amount` is the price for the active interval |

Use `billing.amount` / `billing.currency` as the subscription revenue for the current cadence.

## Access rules in analytics-bi

| DirectPay status | analytics-bi access |
|------------------|---------------------|
| `TRIALING`, `ACTIVE`, `PAST_DUE` | Allowed |
| `EXPIRED`, `CANCELLED`, none | Blocked (402) |

## Webhooks

DirectPay sends `subscription.updated` to analytics-bi:

```http
POST /api/webhooks/directpay
X-Easypay-Signature: sha256=<hex>
```

Payload includes `partnerProvisioningExternalUserId` (= organization id), `status`, `currentPeriodEnd`, `pendingInvoiceGuestToken`, and `billing` (same shape as the subscription API — assigned template + amount, or `"No billing is assigned"`).

## Payment

Operators pay platform subscription invoices in DirectPay (Billing UI or guest link `/guest/subscription-invoice/:guestToken`). analytics-bi does not collect subscription payments directly.

Wave on that guest/billing page uses the same Wave portal checkout key (`WAVE_CHECKOUT_BEARER`) as merchant sales. Wave aggregator keys require `aggregated_merchant_id` on every session; DirectPay sends the **main merchant** id (`WAVE_PLATFORM_AGGREGATED_MERCHANT_ID`, or a Wave identity named `<PLATFORM_NAME> Platform`), never the tenant’s aggregated merchant. Tenant aggregated merchants remain for customer sales checkout only.
