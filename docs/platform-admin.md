# Platform administration

This document describes **platform owner** behavior, **tenant isolation**, and the **platform APIs** used by the Businesses / Subscriptions / Invoices screens. For the full documentation index (architecture, components, workflows), see **[docs/README.md](./README.md)**. It complements the main project overview in the repository root `README.md` (which is not replaced by this file).

## Role and login

- The **platform owner** is a normal `User` row with `role = PLATFORM_OWNER`, created or updated by the Prisma seed (`backend/prisma/seed.ts`).
- Credentials are configurable via `backend/.env`: `PLATFORM_OWNER_EMAIL`, `PLATFORM_OWNER_PASSWORD`, optional `PLATFORM_OWNER_NAME` (see `backend/.env.example`).
- On login, the API returns **no** `accessibleBusinesses` for the platform owner; the JWT still identifies the user as `platform_owner`. The UI does not load merchant business context (products, staff, entitlements per business) for this role.

## Sidebar (platform owner)

- **Main menu** after **Dashboard** includes an expandable **Businesses** group:
  - **business** — list of all businesses (paginated).
  - **Subscriptions** — subscription rows with status and **createdAt** date filters (paginated).
  - **invoices** — subscription invoices with status and **createdAt** date filters (paginated).
- Other main items remain (e.g. Payments, Reports, Plan Controls) where allowed by `roles` including `platform_owner`.
- **Platform → System configuration** links to `/platform/system-configuration` (system catalog and plan entitlements), as described in the root README.

Platform owners do **not** see POS, Products, or Orders in the sidebar; route guards align with that.

## Frontend routes (protected)

| Path | Purpose |
|------|---------|
| `/platform/businesses` | Business list |
| `/platform/businesses/:businessId` | Business detail, paginated memberships and subscription history |
| `/platform/subscriptions` | Subscription list with filters |
| `/platform/invoices` | Invoice list with filters |
| `/platform/invoices/:invoiceId` | Invoice detail; **Export PDF** uses the browser print dialog (Save as PDF) |

All require `platform_owner` and the `platform.businesses.manage` permission check used by `ProtectedRoute`.

## API conventions

### Authentication

All routes below require:

- Header: `Authorization: Bearer <jwt>`
- User must be **platform owner** (`requirePlatformOwner`).

### Pagination

- **List endpoints** use `page` (1-based) and `pageSize` (default **10**, max **100** unless noted).
- Responses include `total`, `page`, and `pageSize` alongside `data` (array).

### Date filters (subscriptions & invoices)

- Query params: `createdFrom`, `createdTo` as `YYYY-MM-DD`.
- They filter on **`Subscription.createdAt`** or **`SubscriptionInvoice.createdAt`**, interpreted as **UTC** day bounds: `YYYY-MM-DDT00:00:00.000Z` through `YYYY-MM-DDT23:59:59.999Z`.
- If **both** `createdFrom` and `createdTo` are omitted or blank, the API defaults to **the current UTC calendar day** (same 00:00–23:59 UTC window).
- The web UI initializes the date inputs to **today in the local calendar** and always sends both fields so the form matches the request; **Reset to today** restores that range.

---

## Platform endpoints reference

### Businesses list

`GET /api/platform/businesses?page=&pageSize=`

- Returns businesses with latest subscription snapshot and membership count.
- Response shape: `{ data: Business[], total, page, pageSize }`.

### Business detail

`GET /api/platform/businesses/:businessId?membershipsPage=&membershipsPageSize=&subscriptionsPage=&subscriptionsPageSize=`

- Defaults: page **1**, page size **10** for each of memberships and subscriptions.
- Response `data` includes:
  - Core business fields, `_count` (memberships, products).
  - `memberships` — page of membership rows with user summary.
  - `subscriptions` — page of subscriptions with plan.
  - `membershipsTotal`, `subscriptionsTotal`, and the effective page/size fields for each list.

### Subscriptions list

`GET /api/platform/subscriptions?status=&createdFrom=&createdTo=&page=&pageSize=`

- `status`: optional `SubscriptionStatus` enum value (`TRIALING`, `ACTIVE`, `PAST_DUE`, `CANCELLED`, `EXPIRED`).
- Date default: see above.
- Response: `{ data: [...], total, page, pageSize }`.

### Invoices list

`GET /api/platform/invoices?status=&createdFrom=&createdTo=&page=&pageSize=`

- `status`: optional `InvoiceStatus` (`PENDING`, `PAID`, `FAILED`, `VOID`).
- Date default: same as subscriptions.
- Response: `{ data: [...], total, page, pageSize }`.

### Invoice detail

`GET /api/platform/invoices/:invoiceId`

- Returns one invoice with business, plan, and subscription context for the printable invoice view.

### Other platform APIs (catalog)

System services, system products, and plan entitlements are documented in the root **README.md** under “Important backend endpoints” / “Platform system configuration (UI)”.

---

## Related files (code)

| Area | Location |
|------|----------|
| Platform list/detail logic | `backend/src/services/platform-admin.service.ts` |
| HTTP wiring | `backend/src/app.ts` (routes under `/api/platform/...`) |
| API client & types | `webFrontend/src/services/subscriptionApi.ts` |
| Platform screens | `webFrontend/src/screens/platform/` |
| Pagination UI | `webFrontend/src/components/ui/TablePagination.tsx` |
| Local date helper for inputs | `webFrontend/src/utils/localCalendarDate.ts` |
| Sidebar Businesses group | `webFrontend/src/layouts/Sidebar.tsx`, `webFrontend/src/config/navigation.ts` |

---

## Print / PDF

Invoice export does not generate a binary PDF on the server. The detail page calls `window.print()`; the user chooses **Save as PDF** in the browser. Layout hides the app sidebar and header for print via `print:hidden` and related styles.
