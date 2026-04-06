# Workflow: Authentication and authorization

## Login

1. User submits credentials to the auth endpoint (see `auth.service.ts` / `app.ts`).
2. Server validates password hash and issues a **JWT** containing user id and role claims.
3. Frontend stores the token (e.g. localStorage) and sends `Authorization: Bearer <jwt>` on subsequent requests.

## Business context

- Most merchant APIs require **`x-business-id`**.
- The server checks **`BusinessMembership`** (or platform owner bypass rules) so a user cannot operate on arbitrary business IDs.

## Roles

| Role | Typical use |
|------|-------------|
| `PLATFORM_OWNER` | Full platform UI; no merchant business workspace by default |
| `PLATFORM_ADMIN` | Delegated platform operator; permissions via function groups / templates |
| `ADMIN` / `MERCHANT` / `CASHIER` | Tenant users; permissions via entitlements |

## Entitlements (feature flags)

- Plans and **system entitlements** determine which **permission slugs** apply (e.g. `pos.access`, `orders.view`).
- **`getBusinessNavigationMenu`** / **`getEffectiveEntitlementSlugs`** drive both sidebar and API `requireEntitlement` checks.

## Public routes

- No JWT. Identifiers are **opaque tokens** in URLs or bodies (table token, payment public token, guest tokens for sales documents).
- **Rate limiting** may apply (e.g. restaurant guest orders).

## Password and recovery

- Forgot-password and change-password flows are implemented in auth-related services and exposed as routes; see `app.ts` for exact paths.
