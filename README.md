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

- Platform owner: `owner@qrpay.com / demo123`

## Next recommended step

The current billing flow creates invoices and trial deadlines, but payment collection is still manual/mock. The next logical milestone is a subscription billing screen plus merchant API integration for real payment collection.
