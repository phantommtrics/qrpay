# Operations and environment

## Environment variables (backend)

- **`DATABASE_URL`** — PostgreSQL connection string for Prisma.
- **JWT** — Secret(s) for signing tokens (see `backend/.env.example` and `config/env.ts`).
- **Resend** — `RESEND_API_KEY`, `RESEND_FROM_EMAIL` for transactional email when configured.
- **Payment providers** — Wave/Yonna base URLs and subscription-related keys as applicable (`payment-provider-env.ts`, subscription checkout).
- **`APP_PUBLIC_BASE_URL`** — Optional but required for Wave/Yonna webhook URLs in production. Public HTTPS base where this API’s `/api/webhooks/*` is reachable. Not used for product image URLs.
- **`PLATFORM_URL`** — Required. Base URL of the customer-facing web app; drives guest quotation/invoice links, `/pay/:token` links, **product image absolute URLs** returned by the API (same host should reverse-proxy `/uploads/*` to the API), and wallet return URLs when `APP_PUBLIC_BASE_URL` is unset. The SPA uses **HashRouter**, so those links are emitted as `https://host/#/guest/...` and `https://host/#/pay/...` (see `lib/public-guest-urls.ts`).
- **Simulator** — Flags such as `SIMULATOR_ALLOW_PUBLIC_PAY`, `SIMULATOR_WEBHOOK_SECRET` for dev/test flows.

Always copy from **`.env.example`** and never commit real secrets.

## Database migrations

- Schema: **`backend/prisma/schema.prisma`**
- Apply migrations in each environment: `npx prisma migrate deploy` (production) or `prisma migrate dev` (development).
- If a column is missing in the DB but present in the schema (e.g. `guestToken`), the migration that adds it was not applied — run the SQL from the corresponding `migrations/*/migration.sql` or fix migration history.

## Prisma Client

- After schema changes: `npx prisma generate`.
- On Windows, lock errors (EPERM) can occur if the dev server holds the query engine — stop the process and retry.

## Webhooks

- **Subscription** Wave/Yonna webhooks — Platform billing completion (see subscription webhook services).
- **Simulator** — `POST /api/webhooks/payments/simulator` with shared secret for test completion of `Payment` by `publicToken`.

## Frontend

- **`VITE_*`** or configured API base — see `webFrontend` env and `src/config/api.ts` for `API_BASE_URL`.

## Health and deployment

- **Backend** — Node process; ensure PostgreSQL reachable and `NODE_ENV` set appropriately.
- **CORS** — Configured in `app.ts` for allowed web origins.

## Logs

- Email dispatch failures may be recorded on **`StaffCreationNotificationLog`** with delivery status.
- Server errors use `HttpError` and standard logging patterns in services (see `console.error` in email queues).
