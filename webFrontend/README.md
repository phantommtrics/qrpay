# EasyPay Web Frontend

This frontend is a React + TypeScript + Vite application for the EasyPay demo flows:

- admin and merchant dashboard views
- cashier POS and checkout flow
- customer self-service restaurant ordering flow
- reporting, payments, and products management screens

## What Changed So Far

The original app was heavily centered in `src/App.tsx`, with screens, layout, routes, helpers, and UI patterns mixed together. The codebase has now been refactored into smaller responsibilities so multiple teammates can work in parallel more safely.

Completed refactor work:

- split page-level screens into separate files under `src/screens`
- moved shared layout into `src/layouts`
- moved routing into `src/routes`
- centralized route and sidebar config in `src/config/navigation.ts`
- extracted auth state into `src/features/auth/AuthContext.tsx`
- added route-level lazy loading for screens
- extracted reusable UI wrappers into `src/components/ui`
- extracted reusable status UI into `src/components/status`
- extracted product details modal into `src/components/products`
- extracted shared cart logic into `src/features/cart/useCart.ts`
- extracted shared money formatting into `src/utils/formatMoney.ts`

## Current Structure

```text
src/
  App.tsx
  config/
    navigation.ts
  components/
    products/
    status/
    ui/
  data/
    mockData.ts
  features/
    auth/
      AuthContext.tsx
    cart/
      useCart.ts
  layouts/
    AppLayout.tsx
    Header.tsx
    Sidebar.tsx
  routes/
    AppRoutes.tsx
    ProtectedRoute.tsx
    RouteFallback.tsx
  screens/
    CustomerMenuPage.tsx
    DashboardPage.tsx
    LoginPage.tsx
    OrdersPage.tsx
    PaymentsPage.tsx
    POSPage.tsx
    ProductsPage.tsx
    ReportsPage.tsx
  types.ts
  utils/
    formatMoney.ts
```

## Responsibility Guide

### `src/App.tsx`

App bootstrap only. It should stay small and mainly compose providers plus the router.

### `src/routes`

Owns navigation flow and route protection.

- `AppRoutes.tsx`: route definitions and lazy-loaded screens
- `ProtectedRoute.tsx`: authenticated route guard
- `RouteFallback.tsx`: route loading state

### `src/layouts`

Owns shared app shell and persistent layout UI.

- `AppLayout.tsx`: page frame for authenticated areas
- `Header.tsx`: top bar
- `Sidebar.tsx`: main navigation

### `src/features`

Owns reusable stateful business logic.

- `auth/AuthContext.tsx`: login state and logout/login actions
- `cart/useCart.ts`: reusable cart behavior for POS and customer ordering

### `src/screens`

Owns page-specific UI and flow logic. A screen should focus on its page behavior, not shared shell logic.

### `src/components`

Owns reusable presentational pieces.

- `ui/`: generic building blocks like cards, transitions, modals, sheets
- `status/`: reusable status badges
- `products/`: product-specific shared UI

### `src/config`

Owns shared route paths, page titles, and sidebar metadata so route changes happen in one place.

### `src/utils`

Owns pure reusable helpers with no React state.

## Team Working Notes

Use these guidelines when extending the project:

- add new full pages inside `src/screens`
- add shared page chrome inside `src/layouts`
- add reusable stateful logic inside `src/features`
- add reusable display components inside `src/components`
- add route constants and shared nav metadata inside `src/config`
- add formatting and pure helper logic inside `src/utils`
- keep `src/App.tsx` thin
- avoid re-adding business logic directly into screen files when it can be shared

## Why This Refactor Matters

- easier onboarding because files now reflect clear responsibilities
- safer parallel work because screens, routing, layout, and features are separated
- less duplication across screens
- simpler reviews because changes are more localized
- better performance because screens are lazy-loaded instead of bundled together upfront

## Commands

Run the dev server:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

Run linting:

```bash
npm run lint
```

## Current Status

The refactor so far is structural. The goal has been to improve maintainability and readability without changing existing flow or user-facing behavior.

The app has been repeatedly validated with successful production builds after each major refactor step.
