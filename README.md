# EasyPay

EasyPay is a subscription-enabled merchant application with a React frontend and an Express + Prisma backend.

## Current business model

- One login account can own or access multiple businesses.
- Each business keeps its own subscription, invoices, and trial status.
- New business subscriptions start in a 7-day trial window.
- The first invoice is created immediately and must be paid before the trial window expires.

## Multi-business ownership

The backend now uses a membership model instead of binding a user directly to one business.

### Core entities

- `User`: one identity per email/password login
- `Business`: merchant organization
- `BusinessMembership`: links a user to one or more businesses
- `Subscription`: billing state for a specific business
- `SubscriptionInvoice`: invoice for a business subscription period

### What this enables

- A merchant can create a second or third business with the same login.
- After login, the frontend loads all businesses the user can access.
- The active business can be changed from the app header business switcher.
- Staff management and plan checks run against the selected business.

## Authentication and registration flow

### Register first business

1. User submits name, email, password, business, and plan.
2. Backend creates the `User`.
3. Backend creates the `Business`.
4. Backend creates an owner `BusinessMembership`.
5. Backend creates a trial subscription and first invoice.

### Register another business with the same account

1. User signs up again with the same email and password.
2. Backend verifies the existing account credentials.
3. Backend creates a new `Business`.
4. Backend creates another owner `BusinessMembership`.
5. Backend creates a subscription and invoice for the new business.

### Login

1. User authenticates once with email and password.
2. Backend returns the user plus every accessible business.
3. Frontend stores the accessible businesses locally.
4. Frontend selects an active business and refreshes that business context.

## Business switching

The frontend keeps one signed-in user and one active business context.

- Header switcher: changes the active business
- Subscription banner: reflects the active business only
- Staff list: loaded for the active business only
- Mock POS/orders/payments/accounting screens: filtered by the active business id

## Trial and billing behavior

- A new subscription starts as `TRIALING`.
- Trial deadline: 7 days from subscription start.
- Invoice due date matches the trial end date.
- Paying the invoice moves the subscription to `ACTIVE`.
- Unpaid trial subscriptions expire once the due date passes.

## Important backend endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/plans`
- `GET /api/businesses/:businessId/users`
- `POST /api/businesses/:businessId/users`
- `GET /api/businesses/:businessId/subscription`
- `POST /api/businesses/:businessId/subscription`
- `POST /api/subscriptions/:subscriptionId/renew`
- `POST /api/invoices/:invoiceId/pay`

## Local development

### Backend

```bash
cd backend
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

### Frontend

```bash
cd webFrontend
npm install
npm run dev
```

## Seeded account

- Platform owner: defaults to `owner@qrpay.com / demo123` unless you set `PLATFORM_OWNER_EMAIL`, `PLATFORM_OWNER_PASSWORD`, and optionally `PLATFORM_OWNER_NAME` in `backend/.env` before running `npx prisma db seed` (see `backend/.env.example`). After deploying with a known seed password, change it (sign in → change password, or re-seed with a new `PLATFORM_OWNER_PASSWORD`).

## Plan entitlements and staff access

The app models **what a business is allowed to do** with two layers:

1. **Subscription plan** — each plan includes a set of **system products** (entitlement slugs such as `products.view`, `products.create`). These rows live in `SystemService`, `SystemProduct`, and `PlanSystemProduct`.
2. **Per-user assignments** — for **non-owner** members, `BusinessUserSystemProduct` stores which plan products that user may use.

### Effective entitlements

- **Business owner**: always receives **all** slugs on the business’s current plan (assignments are not applied).
- **Staff (non-owner)**:
  - **No assignment rows** → **no** plan feature entitlements until the owner assigns products in **Configuration**.
  - **Some assignment rows** → entitlements are the **intersection** of plan slugs and assigned product slugs.

Login and `GET /api/businesses/:businessId/entitlements` return this effective list. API routes use `requireEntitlement("<slug>")` so server checks match the same slugs the UI uses (`canAccess`).

### Business Configuration (merchant)

- Route: **`/configuration`** — linked from the sidebar under **Organization** via the `business.configuration` system product (`navPath` / `navLabel`), same as other plan-driven menu items. There is no separate duplicate “Configuration” row outside that group. **Platform owners** use **`/platform/system-configuration`** for the system catalog.
- Owners choose a **staff** member and toggle which plan products they may use.
- Saving with **every** plan product selected stores explicit IDs (full access for that user); the UI explains this in copy on the page.

### Related API endpoints

- `GET /api/businesses/:businessId/entitlements` — effective slug list for the current user.
- `GET /api/businesses/:businessId/navigation-menu` — sidebar structure grouped by **system service**, filtered by effective entitlements (only products with both `navPath` and `navLabel` set appear, including **Configuration** under Organization when entitled).
- `GET /api/businesses/:businessId/plan-catalog` — full plan product catalog grouped by service (for the assignment UI).
- `GET|PUT /api/businesses/:businessId/users/:targetUserId/plan-access` — read/update assigned `systemProductIds`. **PUT** is rejected for the **business owner** (owner always has full plan access).

Platform-only catalog and plan editing:

- `GET|POST /api/platform/system-services`, `PATCH|DELETE .../system-services/:id`
- `GET|POST /api/platform/system-products`, `PATCH|DELETE .../system-products/:id`
- `GET|PUT /api/platform/plans/:planCode/entitlements`

## Platform system configuration (UI)

Under **`/platform/system-configuration`** (platform owner):

- **Services** — create/delete system services.
- **Products** — add a **module name** and **base slug**. The API ensures five entitlement products exist: `{base}.view`, `{base}.edit`, `{base}.delete`, `{base}.export`, `{base}.create` (creates only missing slugs; fails if all five already exist). Trailing `.view` / `.create` / etc. on input are stripped to normalize the base.
- **Plan entitlements** — attach system products to each plan.
- The **system products** list is grouped **by service**, then each row shows **product name** and **key** (slug).

New catalog products are **not** added to plans automatically; enable them under **Plan entitlements** after creation.

## Frontend notes (sidebar and guards)

- For **non–platform-owner** users with a selected business, the sidebar loads **`navigation-menu`** from the API and renders **collapsible sections per system service** with links from `navPath` / `navLabel`. If that request fails or returns nothing, the UI falls back to the static nav filtered by `canAccess`.
- After a successful navigation-menu fetch (and on some error paths), the client **refetches entitlements** so `canAccess` stays aligned with the server. Returning to the tab (**visibility change**) also refetches entitlements.
- **Cashier** is included on the same route role lists as **merchant** for modules that can be assigned by plan (e.g. products, dashboard, payments, reports, accounting), so assigned cashiers are not blocked by role while still requiring the correct entitlement slug.

## Next recommended step

The current billing flow creates invoices and trial deadlines, but payment collection is still manual/mock. The next logical milestone is a subscription billing screen plus merchant API integration for real payment collection.
