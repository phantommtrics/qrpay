# 7-aside (internal partner) — Easypay API integration

This document is for **server-to-server** integration between the 7-aside booking app and the Easypay backend. All calls use a shared secret; **never** expose that secret in mobile or browser clients.

Easypay environment variables for this flow are documented in `backend/.env.example` (`INTERNAL_PARTNER_*`).

---

## Base URL

Use the **Easypay API origin** (where the Node/Express API is hosted), **without a trailing slash**.

| Environment | Example |
|---------------|---------|
| Local dev | `http://localhost:4000` (or the `PORT` value in Easypay `backend/.env`) |
| Staging / production | `https://<your-easypay-api-host>` |

All partner routes live under:

```text
{EASYPAY_API_BASE_URL}/api/internal-partner/v1/
```

Example: `https://api.easypay.example.com/api/internal-partner/v1/provision`

**Note:** Wave/Yonna return URLs shown to the payer are built from Easypay’s own `APP_PUBLIC_BASE_URL` / `PLATFORM_URL` configuration. The 7-aside server only needs `{EASYPAY_API_BASE_URL}` for API calls.

---

## Authentication

Every request must include the **API** secret from Easypay’s environment (`INTERNAL_PARTNER_API_SECRET`). This is **not** the same value as `INTERNAL_PARTNER_WEBHOOK_SECRET` (used only to verify **inbound** payment webhooks from Easypay to your app).

Preferred:

```http
Authorization: Bearer <INTERNAL_PARTNER_API_SECRET>
Content-Type: application/json
```

Also accepted (for clients that omit the `Bearer` prefix):

```http
Authorization: <INTERNAL_PARTNER_API_SECRET>
```

If a reverse proxy or API gateway **strips** the `Authorization` header on outbound requests, send the same secret in:

```http
X-Easypay-Internal-Partner-Secret: <INTERNAL_PARTNER_API_SECRET>
```

Easypay may configure **comma-separated** values in `INTERNAL_PARTNER_API_SECRET`; any one of those secrets is accepted (useful when multiple partner backends share one Easypay deployment).

| HTTP status | Meaning |
|-------------|---------|
| **503** | Easypay has no `INTERNAL_PARTNER_API_SECRET` configured. |
| **401** | Missing/ wrong secret, wrong header, or the webhook signing secret was used instead of the API secret. Confirm the exact string Easypay has in `INTERNAL_PARTNER_API_SECRET` (no stray quotes or spaces in `.env`). |

---

## API summary

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/internal-partner/v1/provision` | Create tenant (business + owner user + comped BASIC subscription). Idempotent on `externalUserId`. |
| `POST` | `/api/internal-partner/v1/businesses/:businessId/orders` | Create order for a booking amount. Idempotent while same `partnerExternalBookingId` is still unpaid. |
| `GET` | `/api/internal-partner/v1/businesses/:businessId/orders/:orderId/checkout-wallets` | List configured wallets (APS / Wave / Yonna) for checkout. |
| `POST` | `/api/internal-partner/v1/businesses/:businessId/orders/:orderId/payments/wallet` | Start Wave or Yonna checkout for the order. |
| `POST` | `.../orders/:orderId/payments/aps-wallet/authorize` | APS: send OTP / authorize. |
| `POST` | `.../orders/:orderId/payments/aps-wallet/complete` | APS: submit OTP / complete payment. |
| `DELETE` | `/api/internal-partner/v1/businesses/:businessId/orders/:orderId` | Cancel unpaid partner order. |

Gateway `code` values match Easypay’s enabled payment gateways for that business (configured by the platform owner under Merchant API / gateway credentials).

---

## 1) Provision (once per external user)

**`POST {EASYPAY_API_BASE_URL}/api/internal-partner/v1/provision`**

- **201** — first creation  
- **200** — same `externalUserId` replayed (idempotent)

**Body (JSON):**

| Field | Required | Description |
|-------|------------|-------------|
| `externalUserId` | Yes | Stable id from 7-aside (e.g. organiser user id). |
| `ownerEmail` | Yes | Reused if it already belongs to a merchant owner, so one person can hold multiple partner businesses (like self-serve merchants). Rejected only for deactivated or non-merchant accounts. |
| `ownerName` | Yes | Display name for the owner user. |
| `businessName` | Yes | Tenant display name. |
| `slug` | No | URL slug hint; Easypay may suffix if taken. |
| `industry` | No | Optional industry label. |
| `webhookUrl` | No | HTTPS override for outbound webhooks for this business only. |

**Response `data`:** `businessId`, `userId`, `subscriptionId`, `slug`, `idempotentReplay`.

Wave sales checkout is **not** created during partner provision. The **Easypay platform owner** must create the Wave aggregated merchant for each `businessId` from **Platform → Businesses → [business] → Wave sales checkout** (or **Wave Businesses**) before Wave wallet checkout is available.

```typescript
const EASYPAY_API_BASE_URL = process.env.EASYPAY_API_BASE_URL!.replace(/\/$/, "");
const INTERNAL_PARTNER_API_SECRET = process.env.INTERNAL_PARTNER_API_SECRET!;

async function provisionEasypayTenant(input: {
  externalUserId: string;
  ownerEmail: string;
  ownerName: string;
  businessName: string;
  slug?: string;
  industry?: string;
  webhookUrl?: string | null;
}) {
  const res = await fetch(`${EASYPAY_API_BASE_URL}/api/internal-partner/v1/provision`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${INTERNAL_PARTNER_API_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`provision ${res.status}: ${JSON.stringify(json)}`);
  return json.data as {
    businessId: string;
    userId: string;
    subscriptionId: string;
    slug: string;
    idempotentReplay: boolean;
  };
}
```

Merchant wallet credentials (APS / Wave / Yonna) are entered by the **Easypay platform owner** for that `businessId`; there is no deep link into the merchant self-serve UI for this flow. For **Wave**, the platform owner creates the aggregated merchant manually after provision.

---

## 2) Create order (per booking payment)

**`POST …/businesses/{businessId}/orders`**

- **201** — new order  
- **200** — same `partnerExternalBookingId` still pending (same order returned)

**Body:**

| Field | Required | Notes |
|-------|----------|-------|
| `partnerExternalBookingId` | yes | Your booking / checkout id (idempotency key while unpaid). |
| `amountGmd` | yes | Positive number. |
| `currency` | no | Defaults to `GMD`. |
| `category` | no | Optional label for the order type (e.g. `"Pitch rental"`, `"Tournament fee"`). Max 120 characters. Stored on the Easypay order and echoed in API responses and payment webhooks. Omitted on idempotent **200** replay of an existing pending order (category is only set when the order is first created). |

```typescript
async function createEasypayOrder(
  businessId: string,
  input: {
    partnerExternalBookingId: string;
    amountGmd: number;
    currency?: string;
    category?: string;
  },
) {
  const res = await fetch(
    `${EASYPAY_API_BASE_URL}/api/internal-partner/v1/businesses/${encodeURIComponent(businessId)}/orders`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INTERNAL_PARTNER_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    },
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`order ${res.status}: ${JSON.stringify(json)}`);
  return json.data.order as {
    id: string;
    publicCode: string;
    status: string;
    total: number;
    currency: string;
    partnerExternalBookingId: string | null;
    /** Present when you passed `category` at create time; otherwise `null`. */
    category: string | null;
  };
}
```

### API update — optional `category` (partner apps)

When creating an order at checkout time, you may include an optional **`category`** string in the JSON body of `POST …/businesses/{businessId}/orders`. Use it to tag what the payment is for in your own taxonomy (booking type, product line, etc.). Easypay persists it on the order, returns it as `category` on the order object, and includes `category` on outbound webhooks (`payment.completed`, `payment.cancelled`, `payment.failed`) when set. No change is required if you do not need segmentation — existing integrations without `category` continue to work.

---

## 3) List wallets

**`GET …/businesses/{businessId}/orders/{orderId}/checkout-wallets`**

Response `data` includes:

| Field | Purpose |
|-------|---------|
| `wallets` | Gateways **ready for checkout** (same rules as Easypay POS): Wave needs a provisioned **aggregated merchant** and platform `WAVE_CHECKOUT_BEARER`; Yonna needs client id + secret; APS needs username + password **and** server env `APS_WALLET_BASE_URL`. |
| `gatewayStatus` | One row per **enabled** platform gateway that has a checkout adapter — includes `hasCredential`, `checkoutConfigured`, and `fieldStatus` **booleans only** (no secrets). Use this when `wallets` is empty to see *why* (e.g. Wave aggregated merchant missing, or APS API base not configured). |
| `readinessHint` | Short human-readable summary when `wallets` is empty, or `null` when at least one wallet is available. |

**Common reasons `wallets` is empty while “credentials exist” on Easypay**

- **Incomplete stored secrets** — e.g. Wave saved without a provisioned aggregated merchant (`fieldStatus.aggregatedMerchant`), platform `WAVE_CHECKOUT_BEARER` missing (`fieldStatus.platformWaveBearer`), or Yonna missing `clientId` / `secretKey`. Businesses with legacy per-business Wave bearer tokens must re-save Wave in Merchant API. Check `gatewayStatus[].fieldStatus`.
- **APS** — merchant username/password can be saved, but listing requires **`APS_WALLET_BASE_URL`** (and related APS env) on the Easypay API server.
- **Decryption** — if `APP_SECRET_ENCRYPTION_KEY` changed after secrets were saved, decrypt fails and `checkoutConfigured` stays false until credentials are re-saved.
- **Wrong tenant** — credentials are on a different `businessId` than the one 7-aside uses (`hasCredential` false for all rows).
- **Gateway disabled** — gateway not in `gatewayStatus` at all if it is disabled under Platform → Payment gateways.

```typescript
async function listEasypayWallets(businessId: string, orderId: string) {
  const res = await fetch(
    `${EASYPAY_API_BASE_URL}/api/internal-partner/v1/businesses/${businessId}/orders/${orderId}/checkout-wallets`,
    { headers: { Authorization: `Bearer ${INTERNAL_PARTNER_API_SECRET}` } },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  const { wallets, gatewayStatus, readinessHint } = json.data as {
    wallets: Array<{
      gatewayId: string;
      code: string;
      name: string;
      checkoutAdapter: string;
      hasStoredPayerPhone: boolean;
    }>;
    gatewayStatus: Array<{
      gatewayId: string;
      code: string;
      name: string;
      checkoutAdapter: string | null;
      hasCredential: boolean;
      checkoutConfigured: boolean;
      fieldStatus: Record<string, boolean | undefined>;
      updatedAt: string | null;
    }>;
    readinessHint: string | null;
  };
  if (wallets.length === 0 && readinessHint) {
    console.warn("[7-aside] Easypay wallets empty:", readinessHint, gatewayStatus);
  }
  return { wallets, gatewayStatus, readinessHint };
}
```

---

## 4) Start Wave / Yonna checkout

**`POST …/businesses/{businessId}/orders/{orderId}/payments/wallet`**

**Body:** `gatewayCode` (required when multiple wallets exist), optional `payerPhone` (Yonna).

```typescript
async function startEasypayWalletCheckout(
  businessId: string,
  orderId: string,
  body: { gatewayCode: string; payerPhone?: string },
) {
  const res = await fetch(
    `${EASYPAY_API_BASE_URL}/api/internal-partner/v1/businesses/${businessId}/orders/${orderId}/payments/wallet`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${INTERNAL_PARTNER_API_SECRET}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const json = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(json));
  return json.data as {
    payment: Record<string, unknown>;
    qrPayload: string;
    launchUrl: string;
    paymentHtml: string | null;
    checkoutAdapter: string;
  };
}
```

---

## 5) APS (two steps)

1. **Authorize** — `POST …/payments/aps-wallet/authorize`  
   Body: `{ "gatewayCode": "<code>", "payerMobile": "<digits>" }`  
   Response: `authState`, `requiresOtp`.

2. **Complete** — `POST …/payments/aps-wallet/complete`  
   Body: `{ "gatewayCode", "authState", "otp"? }`

---

## 6) Cancel unpaid order

**`DELETE …/businesses/{businessId}/orders/{orderId}`** → **204** on success.

```typescript
async function cancelEasypayOrder(businessId: string, orderId: string) {
  const res = await fetch(
    `${EASYPAY_API_BASE_URL}/api/internal-partner/v1/businesses/${businessId}/orders/${orderId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${INTERNAL_PARTNER_API_SECRET}` },
    },
  );
  if (res.status !== 204) throw new Error(await res.text());
}
```

---

## Inbound webhooks (Easypay → 7-aside)

Configure on Easypay (preferred: **Platform → Security → Partnership config** in the DirectPay admin UI — add each partner webhook URL with its own signing secret):

- **Partnership config (UI)** — add multiple webhook endpoints with encrypted signing secrets (replaces env-based URL lists when any endpoint exists).
- `INTERNAL_PARTNER_WEBHOOK_URL` — legacy fallback: comma-separated POST URLs when no UI endpoints are configured.
- `INTERNAL_PARTNER_WEBHOOK_SECRET` — legacy fallback HMAC key when using env URLs without per-URL secrets.
- `INTERNAL_PARTNER_WEBHOOK_SECRETS` (optional, legacy) — comma-separated signing keys paired to env URLs.
- Optional: `webhookUrl` on **provision** overrides the default list for that business only (single URL).

Deliveries are **queued and retried** on non-2xx or network errors (worker interval: `INTERNAL_PARTNER_WEBHOOK_WORKER_MS`, default 20000 ms).

### Signature

- Header: `X-Easypay-Signature: sha256=<hex>`
- `<hex>` = `HMAC_SHA256(<signing secret for that webhook URL>, rawBody)` where `rawBody` is the **exact** UTF-8 JSON string of the request body (same string Easypay stored for the job). The signing secret is the env entry paired with that URL, or `INTERNAL_PARTNER_WEBHOOK_SECRET` when using a single shared key or a per-business URL not in the paired list.

### Events (`event` field in JSON)

| `event` | When |
|---------|------|
| `payment.completed` | Wallet payment for the partner order succeeded. |
| `payment.cancelled` | Pending wallet payment(s) cancelled (e.g. order cancelled, checkout replaced, APS authorize replaced). Includes `reason`. |
| `payment.failed` | APS path marked payment `FAILED` (authorize / confirm / process). Includes `reason` and optional `detail`. |

Payloads include identifiers such as `businessId`, `partnerProvisioningExternalUserId`, `partnerExternalBookingId`, `category` (string or `null`, from create-order body), `orderId`, `orderPublicCode`, `paymentId`, `paymentStatus`, `amount` (where applicable), `provider`, `gatewayCode`, `providerRef`, `occurredAt`.

**7-aside should:** verify HMAC, return **2xx** quickly, and handle duplicates idempotently (`paymentId` + `event`).

### Express: verify HMAC on raw body

Use `express.raw({ type: "application/json" })` for the webhook route so the body bytes match the signature.

```typescript
import crypto from "node:crypto";

function verifyEasypayPartnerWebhook(
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
  const got = (signatureHeader ?? "").trim();
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}
```

---

## Easypay server logs (operations / support)

Search Easypay API logs for the prefix **`[internal-partner]`**:

| Log message | Meaning |
|-------------|---------|
| `Webhook not queued: set INTERNAL_PARTNER_WEBHOOK_URL…` | Success path but default webhook URLs / signing config is missing or invalid (e.g. URL count ≠ secret count when using multiple `INTERNAL_PARTNER_WEBHOOK_SECRETS`). |
| `Failed to queue payment.completed webhook:` | Rare enqueue error after a successful payment. |
| `Failed to queue cancel webhook:` | Enqueue error when cancelling or replacing a checkout. |
| `Failed to queue payment.failed webhook:` | Enqueue error on APS failure handling. |
| `Webhook worker initial run error:` | First worker tick failed (e.g. DB). |
| `Webhook worker error:` | Periodic worker tick failed. |
| `Webhook job abandoned after max attempts:` | Partner endpoint failed repeatedly; fix URL/handler or inspect dead-letter row in `PartnerOutboundWebhookJob`. |

APS checkout also logs under **`[APS Wallet]`** (e.g. `order_checkout_authorize_start`, `order_checkout_complete_failed`) for OTP and APS API issues.

---

## Checklist for 7-aside

1. Store `EASYPAY_API_BASE_URL`, `INTERNAL_PARTNER_API_SECRET`, and the HMAC secret(s) that match Easypay (`INTERNAL_PARTNER_WEBHOOK_SECRET` and/or per-URL `INTERNAL_PARTNER_WEBHOOK_SECRETS`) for verifying inbound webhooks.  
2. On organiser signup: **provision** → persist `businessId`.  
3. On payer checkout: **create order** → **list wallets** → **start wallet** or APS **authorize** / **complete**.  
4. Host an HTTPS webhook; verify **HMAC**; respond **2xx**; dedupe by `paymentId` + `event`.  
5. On booking cancellation before pay: **DELETE** order if still unpaid.

---

## Related Easypay docs

- [Backend components](./components-backend.md) — API surface and services map  
- [Operations & environment](./operations-and-env.md) — env vars and deployment  
- [POS, orders & payments](./workflows-merchant-pos-and-payments.md) — underlying order/payment model (partner routes reuse the same checkout stack)
