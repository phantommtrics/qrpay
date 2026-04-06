# Workflow: POS, orders, and customer payments

## Order lifecycle

1. **Create order** — Staff (POS) creates an order with lines (`Product` references); status **`PENDING_PAYMENT`**.
2. **Pay** — Cash or **QR wallet** (simulator in dev, Wave/Yonna when configured).
3. **Complete** — Order marked **`PAID`**, **`Receipt`** created, stock/commitment rules applied as implemented in `sale.service.ts`.
4. **Accounting** — Customer sale journal and optional wallet fee handling (`sale-accounting.service.ts`, merchant POS wallet fee resolution).

## Wallet checkout (merchant credentials)

- **`listOrderCheckoutWallets`** — Lists gateways the business has **configured** (Merchant API + enabled payment method).
- **`startWalletPayment`** / **`startGatewayWalletCheckout`** — Creates a **`Payment`** row with `publicToken` and provider session (Wave session URL, Yonna flow, or simulator URL).
- **Secrets** come from **`getDecryptedGatewaySecrets(businessId, gatewayCode)`** — **not** platform subscription keys.

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
