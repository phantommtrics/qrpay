# Workflow: POS, orders, and customer payments

## Order lifecycle

1. **Create order** — Staff (POS) creates an order with lines (`Product` references); status **`PENDING_PAYMENT`**.
2. **Pay** — Cash or **QR wallet** (simulator in dev, Wave/Yonna when configured).
3. **Complete** — Order marked **`PAID`**, **`Receipt`** created, stock/commitment rules applied as implemented in `sale.service.ts`.
4. **Accounting** — Customer sale journal and optional wallet fee handling (`sale-accounting.service.ts`, merchant POS wallet fee resolution).

## Wallet checkout (merchant credentials)

- **`listOrderCheckoutWallets`** — Lists gateways the business has **configured** (Merchant API + enabled payment method).
- **`startWalletPayment`** / **`startGatewayWalletCheckout`** — Creates a **`Payment`** row with `publicToken` and provider session (Wave session URL, Yonna flow, or simulator URL).
- **Wave** — Uses the platform aggregator token (`WAVE_CHECKOUT_BEARER` on the API server) plus each business’s **Wave aggregated merchant id** (provisioned via Merchant API; stored encrypted in `BusinessGatewayCredential`). No per-business Wave API bearer.
- **Yonna / APS** — Secrets still come from **`getDecryptedGatewaySecrets(businessId, gatewayCode)`** per business.

### Auto-provision on business creation

When `WAVE_CHECKOUT_BEARER` is set and the Wave gateway is enabled, new businesses get a Wave aggregated merchant and encrypted credential row automatically during owner signup and `POST /api/businesses`. **Internal-partner provision does not auto-create Wave merchants** — the platform owner must initiate that from the business detail or Wave Businesses screen. Each attempt is stored in `WaveAggregatedMerchantProvisionLog`.

Platform operators provision or re-sync existing tenants from **`/#/platform/businesses/:id`** (Wave sales checkout panel). Merchants do not enter Wave API keys, webhook secrets, or bearer tokens — only Yonna/APS use Merchant API credential forms.

### Migrating existing Wave credentials

Businesses that previously saved a per-business Wave bearer must **re-save Wave** under Merchant API (profile fields), or rely on auto-provision for businesses created after this change. Old ciphertext without `aggregatedMerchantId` is treated as not configured until re-provisioned.

## Public pay page (`/pay/:publicToken`)

- Customer lands after Wave success URL or simulator link.
- **`getPublicPayInfo`** returns amount and status; **`completeWalletPaymentByPublicToken`** completes the payment when allowed (simulator or webhook path).
- For **orders**, completion ties to **`Order`**; for **sales invoices**, completion uses **`salesInvoiceId`** on the payment and runs **`markSalesInvoicePaidWithWalletPayment`** (see sales workflow doc).

## Cash

- **`completeCashPayment`** — Marks order paid without wallet provider; still creates receipt and accounting per service logic.

## Simulator

- Dev/staging may use **`SIMULATOR`** provider and optional public simulate endpoint (`isSimulatorPublicPayEnabled`).

## Payments list

- Merchant **Payments** screen lists **`Payment`** rows for the business (includes both order-linked and invoice-linked wallet payments when present).
