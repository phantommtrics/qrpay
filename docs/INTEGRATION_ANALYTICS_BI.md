# analytics-bi (biReports) — DirectPay API integration

Server-to-server integration between **analytics-bi** and **DirectPay** for tenant provisioning and platform subscription billing.

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

## Subscription (Business Pro default)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/internal-partner/v1/businesses/:businessId/subscription` | Read status, period end, pending invoice |
| `POST` | `/api/internal-partner/v1/businesses/:businessId/subscription` | Start subscription (defaults to `BUSINESS_PRO`) |

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

Payload includes `partnerProvisioningExternalUserId` (= organization id), `status`, `currentPeriodEnd`, `pendingInvoiceGuestToken`.

## Payment

Operators pay platform subscription invoices in DirectPay (Billing UI or guest link `/guest/subscription-invoice/:guestToken`). analytics-bi does not collect subscription payments directly.
