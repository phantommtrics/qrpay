# Workflow: Restaurant (guest menu and orders)

## Purpose

Allows **diners** at a table to browse a **public menu** and place **orders without logging in**, scoped by **business slug** and **table token**.

## URLs

- Pattern: **`/b/:businessSlug/:tableToken`** (see `APP_PATHS.restaurantGuestMenu`).
- Table tokens come from **`DiningTable.publicToken`** (created in restaurant tables setup).

## Backend

- **`restaurant-public.service.ts`** — Builds menu payload for the guest UI; creates guest orders.
- **`allowPublicRestaurantOrder`** (rate limit) — Protects public order endpoints from abuse.

## Flow

1. Guest opens QR link → frontend loads menu (`RestaurantGuestMenuPage`).
2. Public API fetches products/menu tree for **business slug** + validates **table token**.
3. Guest submits order → **`createRestaurantGuestOrder`** creates an **`Order`** (often `PENDING_PAYMENT` until staff/POS handles payment depending on configuration).

## Relationship to POS

- Staff still use **POS / Orders** to manage fulfillment and payment for those orders in the normal merchant flow.

## Other public product surfaces

- **`/p/:productId`** — Product public page (`ProductPublicPage`) — separate from restaurant flow.
