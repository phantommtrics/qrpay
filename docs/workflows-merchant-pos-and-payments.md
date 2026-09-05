# Workflow: POS, orders, and customer payments

## Order lifecycle

1. **Create order** — Staff (POS) creates an order with lines (`Product` references); status **`PENDING_PAYMENT`**.
2. **Pay** — Cash or **QR wallet** (simulator in dev, Wave/Yonna when configured).
3. **Complete** — Order marked **`PAID`**, **`Receipt`** created, stock/commitment rules applied as implemented in `sale.service.ts`.
4. **Accounting** — Customer sale journal and optional wallet fee handling (`sale-accounting.service.ts`, merchant POS wallet fee resolution).

## Wallet checkout (merchant credentials)

- **`listOrderCheckoutWallets`** — Lists gateways the business has **configured** (Merchant API + enabled payment method).
- **`startWalletPayment`** / **`startGatewayWalletCheckout`** — Creates a **`Payment`** row with `publicToken` and provider session (Wave session URL, Yonna flow, or simulator URL).
- **Wave** — Default is the platform aggregator token (`WAVE_CHECKOUT_BEARER` on the API server) plus each business’s **Wave aggregated merchant id** (provisioned automatically; stored encrypted in `BusinessGatewayCredential`). A business may instead store its own Wave Business **API key** (`bearerToken`) and optional **webhook secret** — sales checkout then uses that key and omits `aggregated_merchant_id`. Webhooks still POST to the same `{APP_PUBLIC_BASE_URL}/api/webhooks/wave`. Subscription billing always uses the platform main merchant.
- **Yonna / APS** — Secrets still come from **`getDecryptedGatewaySecrets(businessId, gatewayCode)`** per business.

### Auto-provision on business creation

When `WAVE_CHECKOUT_BEARER` is set and the Wave gateway is enabled, new businesses get a Wave aggregated merchant and encrypted credential row automatically during owner signup and `POST /api/businesses`. **Internal-partner provision does not auto-create Wave merchants** — the platform owner must initiate that from the business detail or Wave Businesses screen. Each attempt is stored in `WaveAggregatedMerchantProvisionLog`.

Platform operators provision or re-sync existing tenants from **`/#/platform/businesses/:id`** (Wave sales checkout panel). Auto-provision is **skipped** when the business already has an own-account Wave API key. Merchants can optionally enter their own Wave API key and webhook secret under Merchant API (same entitlement as Yonna/APS). The webhook URL is the platform Wave URL — not a per-merchant path.

### Own-account vs aggregator Wave

- **Aggregator (default):** `checkoutConfigured` when `fieldStatus.aggregatedMerchant` and `fieldStatus.platformWaveBearer` are true.
- **Own Wave Business account:** `checkoutConfigured` when `fieldStatus.ownAccountBearer` is true. Aggregator provision is skipped and Wave Operations stay on the parent account.

### Aggregator self-settlement

Aggregated merchants’ checkout funds land in the platform Wave wallet, tagged with the tenant `aggregated_merchant_id` (Wave takes its checkout fee, typically ~1%, overridable via `WAVE_SELF_SETTLEMENT_CHECKOUT_FEE_RATE`). Wave rounds those fees to **whole GMD** (0.50 and up → 1, below 0.50 → 0). Optionally, after a successful sales webhook (`POST /api/webhooks/wave`), DirectPay enqueues a **self-settlement payout** to that business’s configured Wave customer number. Wave `receive_amount` is net to the recipient, and Wave then takes a payout fee (typically ~1%, `WAVE_SELF_SETTLEMENT_PAYOUT_FEE_RATE`, same whole-GMD rounding) from the same sub-balance. The posted amount is the largest receive such that **checkout fee + withhold + receive + payout fee = gross**, so the platform withhold remains after both Wave cuts. The payout uses `POST /v1/payout` with `aggregated_merchant_id`. The HTTP 200 to Wave is sent after payment completion and enqueue; a worker performs the payout. On **succeeded**, DirectPay stores a local `WaveOpsPayout` (Wave Operations → Payouts) and posts the platform journal (payout cost + withhold revenue, merchant on the entry). Configure this on **Platform → Businesses → [business] → Wave sales checkout**. Own-account (BYOK) merchants are skipped — funds already sit in their Wave wallet.

## Public pay page (`/pay/:publicToken`)

- Customer lands after Wave success URL or simulator link.
- **`getPublicPayInfo`** returns amount and status; **`completeWalletPaymentByPublicToken`** completes the payment when allowed (simulator or webhook path).
- When two Wave checkouts complete at once, the first status read can miss the row (`Payment not found`). The page keeps confirming and polls for about 45 seconds instead of requiring a refresh; the API also retries once and accepts a Wave session id as `providerRef`.
- For **orders**, completion ties to **`Order`**; for **sales invoices**, completion uses **`salesInvoiceId`** on the payment and runs **`markSalesInvoicePaidWithWalletPayment`** (see sales workflow doc).

## Cash

- **`completeCashPayment`** — Marks order paid without wallet provider; still creates receipt and accounting per service logic.

## Simulator

- Dev/staging may use **`SIMULATOR`** provider and optional public simulate endpoint (`isSimulatorPublicPayEnabled`).

## Payments list

- Merchant **Payments** screen lists **`Payment`** rows for the business (includes both order-linked and invoice-linked wallet payments when present).
