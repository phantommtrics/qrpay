# EASYPay Backend

Starter backend for EASYPay using `Express`, `Postgres`, and `Prisma`.

## Subscription model

- `Basic`: starter merchants
- `Pro`: growing merchants
- `Business Pro`: multi-branch merchants

The backend stores:

- businesses as tenants
- plans as reusable pricing definitions
- subscriptions as the active monthly contract
- invoices as the billable record for each cycle

## Quick start

1. Copy `.env.example` to `.env`
2. Set `DATABASE_URL`
3. Install packages with `npm install`
4. Run `npx prisma migrate dev --name init`
5. Seed plans with `npm run prisma:seed`
6. Start the API with `npm run dev`

## First endpoints

- `GET /api/health`
- `GET /api/plans`
- `POST /api/businesses`
- `GET /api/businesses/:businessId/subscription`
- `POST /api/businesses/:businessId/subscription`
- `POST /api/subscriptions/:subscriptionId/renew`
- `POST /api/invoices/:invoiceId/pay`

## Why this model works

- plans stay centralized, so EASYPay can change pricing in one place
- invoices give a clean monthly billing trail
- subscriptions remain tenant-scoped, which supports future upgrades, downgrades, and webhooks
- the schema is ready for adding payment gateway references later
