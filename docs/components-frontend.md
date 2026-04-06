# Frontend components

## Application shell

- **Entry:** Vite + React (`webFrontend/`).
- **Routing:** `react-router-dom` — **`AppRoutes.tsx`** defines routes and lazy-loaded screens.
- **Auth context:** `features/auth/AuthContext.tsx` — holds logged-in user, token, and business list; drives redirects and headers.

## Layout and navigation

- **`layouts/Sidebar.tsx`** (and related) — Sidebar driven by **`config/navigation.ts`** (`MAIN_NAV_ITEMS`, `APP_PATHS`).
- Navigation items are filtered by **user role** and **entitlement slugs** returned from the API (`getBusinessNavigationMenu`).

## Route categories

| Category | Examples |
|----------|----------|
| Public | `/`, `/login`, `/signup`, `/b/:businessSlug/:tableToken` (guest menu), `/p/:productId`, `/pay/:publicToken`, `/guest/quotation/:token`, `/guest/invoice/:token` |
| Auth-only | `/account/change-password` |
| Protected (merchant) | `/dashboard`, `/pos`, `/orders`, `/products`, `/sales/*`, `/accounting/*`, `/integrations/merchant-api`, … |
| Protected (platform) | `/platform/businesses`, `/platform/subscriptions`, `/platform/invoices`, `/platform/security/*`, `/platform/system-configuration`, … |

## Key screens (illustrative)

| Area | Screens |
|------|---------|
| Dashboard | `DashboardPage`, `PlatformOwnerDashboard` |
| Commerce | `POSPage`, `OrdersPage`, `ProductsPage`, `PaymentsPage` |
| Sales | `SalesQuotationsPage`, `SalesQuotationDetailPage`, `SalesInvoicesPage`, `SalesInvoiceDetailPage` |
| Guest (no login) | `GuestQuotationPage`, `GuestInvoicePage`, `PublicPayPage`, `RestaurantGuestMenuPage` |
| Accounting | `Accounting*`, `GlBalanceReportPage`, `ProfitLossReportPage`, `AccountStatementReportPage` |
| Billing (merchant) | `BillingPage`, `SubscriptionInvoicesPage`, `SubscriptionInvoiceDetailPage`, `BillingWaveResultPage` |
| Platform | `platform/*` — businesses, subscriptions, invoices, gateways, security, platform accounting |
| Integrations | `MerchantApiPage` — store Wave/Yonna credentials per business |

## API layer

- **`services/salesApi.ts`** — Orders, payments, public pay, guest sales endpoints, restaurant public orders.
- **`services/salesDocumentsApi.ts`** — Authenticated CRUD for quotations and invoices.
- **`services/subscriptionApi.ts`** — Large surface: plans, subscriptions, billing, platform admin calls.
- **`config/api.ts`** — `API_BASE_URL` pointing at the backend.

Requests attach `Authorization: Bearer <token>` when logged in, and `x-business-id` when operating as a business.

## Permissions

- **`types`** — `PermissionKey` and route `permission` / `anyOfPermissions` on `MAIN_NAV_ITEMS` and protected routes.
- **`ProtectedRoute`** — Ensures user has required role and permission before rendering children.

## UI primitives

- Shared components under `components/` (e.g. `components/sales/SalesDocumentPaper.tsx` for printable document layout).
