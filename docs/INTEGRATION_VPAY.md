# vPay — directPay internal partner integration

Server-to-server integration for vPay virtual card funding via directPay checkout.

## Partner app: `vpay`

| Field | Value |
|-------|-------|
| `partnerApp` | `"vpay"` |
| Billing | `platformBillingWaived: true` |
| Subscription | Auto perpetual **CORPORATE** (`CONTRACT_INFINITE`, `contractPerpetual: true`, no platform invoices) |
| Checkout | Same internal-partner order / wallet / APS APIs as 7a-side |

Contrast with 7a-side (`partnerApp: "default"`) which gets comped **BASIC**.

## Provision

**`POST {DIRECTPAY_API_BASE_URL}/api/internal-partner/v1/provision`**

```json
{
  "externalUserId": "<vPay user uuid>",
  "ownerEmail": "user@example.com",
  "ownerName": "Modou Jallow",
  "businessName": "Modou-Jallow-vpay",
  "slug": "vpay-modou-abc123",
  "industry": "fintech",
  "partnerApp": "vpay",
  "webhookUrl": "https://api.vpay.example.com/api/webhooks/directpay"
}
```

Auth: `Authorization: Bearer <INTERNAL_PARTNER_API_SECRET>`

## Webhooks

Configure on directPay:

- `INTERNAL_PARTNER_WEBHOOK_URL` — include vPay's `POST /api/webhooks/directpay`
- `INTERNAL_PARTNER_WEBHOOK_SECRET` — shared with vPay

Events: `payment.completed`, `payment.failed`, `payment.cancelled` — `partnerExternalBookingId` is the vPay `FundingOrder.id`.

## Gateway credentials

Platform owner configures APS / Wave for each provisioned `businessId` (same ops model as 7a-side).

## Related docs

- [INTEGRATION_7ASIDE.md](./INTEGRATION_7ASIDE.md) — checkout API reference
- [vPay docs/INTEGRATION_DIRECTPAY.md](../vPay/docs/INTEGRATION_DIRECTPAY.md) — vPay-side setup
