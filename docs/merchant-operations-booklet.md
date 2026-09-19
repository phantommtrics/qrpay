# DirectPay Merchant Operations Booklet

**Audience:** Business owners, managers, cashiers, sales clerks, and finance officers  
**Currency:** All amounts in **Gambian Dalasi (GMD)**  
**Product:** DirectPay  
**Focus:** From sales on the floor to books that balance

---

## How to use this booklet

| Role | Start here |
|------|------------|
| Cashier / floor staff | [Part A — POS & inventory](#part-a--pos--inventory-sales) |
| Sales clerk | [Part B — Sales documents](#part-b--sales-documents) |
| Finance officer | [Part C — Finance & double-entry](#part-c--finance--double-entry-accounting) |
| Owner / manager | [Part D — Reading the books](#part-d--reading-the-books-pl-gl--statements) and [Part E — Daily control](#part-e--daily-control-security--staff) |

DirectPay posts your books on a **cash basis**: revenue and expenses hit the ledger when money is **received or paid**, not only when a document is approved.

---

## Menu map (what you use day to day)

| Group | Screen | Purpose |
|-------|--------|---------|
| Core | Dashboard | Day overview |
| Core | POS / Checkout | Sell from inventory / counter |
| Catalog | Products / Categories | Prices, stock, barcodes |
| Sales | Orders / Payments | Order history and payment records |
| Sales | Quotations | Offers before a sale |
| Sales | Sales invoices | Customer invoices to collect |
| Sales | Bills | Supplier / expense bills to pay |
| Sales | DirectPay settlement | Cash out digital clearing |
| Finance | Chart of accounts | Your ledger list |
| Finance | Journals | See and approve postings |
| Finance | GL / P&L / Balance sheet / Account statement | Period reports |
| Organization | Contacts | Customers and suppliers |
| Organization | Staff / Configuration | Who can do what |
| Merchant | Profile / Merchant API | 2FA and payment gateways |

**Plans:** BASIC covers POS and catalog. **PRO+** adds quotations, invoices, bills, settlement, and finance reports.

**Industry tip:** Restaurant businesses also use **Dining tables** and **Menu setup**. Petrol stations use **Stations & pumps**. Your sidebar only shows what your industry and plan allow.

---

# Part A — POS & inventory sales

## A1. Prepare the catalogue

1. Open **Catalog → Products**.
2. Set name, category, **selling price (GMD)**, **stock**, optional barcode/image.
3. Units available to sell ≈ stock minus stock reserved on unpaid orders.

**Example — Bakau Retail Shop**

| Product | Price (GMD) | Stock |
|---------|-------------|-------|
| Palm oil 5L | 850.00 | 40 |
| Rice 25kg | 1,250.00 | 60 |
| Soft drink 50cl | 35.00 | 200 |

## A2. Ring a sale

1. Open **POS / Checkout**.
2. Add lines → system creates an **Order** (status **PENDING_PAYMENT**).
3. Stock for those lines is **reserved**.
4. Collect **Cash** or **QR wallet** (Wave, Yonna, APS — as configured under Merchant API).
5. On success: order **PAID**, **Receipt** issued, stock reduced, ledger updated automatically.

### Sample — cash sale 990.00 GMD

| Item | Qty | Unit | Line |
|------|-----|------|------|
| Soft drink 50cl | 4 | 35.00 | 140.00 |
| Palm oil 5L | 1 | 850.00 | 850.00 |
| **Total** | | | **990.00** |

**Automatic journal**

| | Account | Debit (GMD) | Credit (GMD) |
|--|---------|-------------|--------------|
| Dr | Cash on hand — POS & counter (`CASH_ON_HAND`) | 990.00 | |
| Cr | sales (`200`) | | 990.00 |

Cash up; sales revenue up → profit up by **990.00** (before any cost of goods you post separately).

### Sample — same sale by Wave / QR

| | Account | Debit (GMD) | Credit (GMD) |
|--|---------|-------------|--------------|
| Dr | Digital payments clearing (`MERCHANT_WALLET_CLEARING`) | 990.00 | |
| Cr | sales (`200`) | | 990.00 |

If a wallet fee applies (illustrative **10.00 GMD**):

| | Account | Debit (GMD) | Credit (GMD) |
|--|---------|-------------|--------------|
| Dr | QR / digital wallet processing fees (`QR_WALLET_FEES`) | 10.00 | |
| Cr | Digital payments clearing | | 10.00 |

**P&L:** Revenue +990; fee +10 → contribution **+980**. Net **980** stays in clearing until you settle (Part B4).

## A3. End of shift

1. Confirm paid orders in **Orders**.  
2. Match **Payments** to till cash and wallet confirmations.  
3. Spot-check product stock.  
4. Hand cash to finance; leave digital sales in clearing until settlement.

---

# Part B — Sales documents

Always pick the right **Contact** (customer or supplier) first.

## B1. Quotations

**Path:** Sales → Quotations · Code e.g. `QT-A1B2C3D4`

| Status | Meaning |
|--------|---------|
| DRAFT | Still editable |
| SENT | Customer has PDF + guest link |
| ACCEPTED | Creates a **draft sales invoice** |
| REJECTED | Customer declined |

**Script:** Draft → Send → customer Accept/Reject → open the draft invoice if accepted.  
Quotations do **not** post to the ledger.

### Sample quotation — 18,000.00 GMD

Customer: **Kerr Serign Guest House**

| Narration | Qty | Unit | Line |
|-----------|-----|------|------|
| Curtain set — twin room | 6 | 2,500.00 | 15,000.00 |
| Fitting labour | 1 | 3,000.00 | 3,000.00 |
| **Total** | | | **18,000.00** |

## B2. Sales invoices (money in)

**Path:** Sales → Sales invoices · Code e.g. `INV-9C2E44B1`

| Status | Ledger? |
|--------|---------|
| DRAFT | No |
| APPROVED | No full GL yet (cash basis) |
| PAID | **Yes — journals posted** |
| VOID | Cancelled |

**Script:** Draft (or from accepted quote) → **Approve** (email + pay link) → customer pays by wallet **or** staff **Mark paid** when cash/bank is received.

> **Approved ≠ Paid.** Books move when the invoice is **PAID**.

### Sample — mark paid to bank 18,000.00 GMD

| | Account | Debit | Credit |
|--|---------|-------|--------|
| Dr | BANK_MAIN (your bank asset) | 18,000.00 | |
| Cr | sales (`200`) — lines | | 18,000.00 |

**P&L:** Revenue **+18,000.00**.

## B3. Bills (money out)

**Path:** Sales → Bills · Code e.g. `BILL-4D88A012`  
Flow: **DRAFT → APPROVED → PAID**. Ledger posts on **Mark paid**.

### Sample — rent and power 15,450.00 GMD

| Narration | Account | Amount |
|-----------|---------|--------|
| Shop rent — Sept | Rent (`469`) | 12,000.00 |
| NAWEC electricity | light, power, heating (`445`) | 3,450.00 |
| **Total** | | **15,450.00** |

Paid from cash:

| | Account | Debit | Credit |
|--|---------|-------|--------|
| Dr | Rent (`469`) | 12,000.00 | |
| Dr | light, power, heating (`445`) | 3,450.00 | |
| Cr | Cash on hand | | 15,450.00 |

**P&L:** Expenses **+15,450.00**.

## B4. DirectPay settlement (clearing → usable funds)

**Path:** Sales → DirectPay settlement  

Wallet sales sit in **Digital payments clearing**. That is not till cash until settled.

| Field | Meaning |
|-------|---------|
| Clearing balance | Amount in clearing |
| Available for settlement | Clearing minus open requests |

**Script:** Check available → request amount → wait until **COMPLETED**.

### Sample — settle 20,000.00 GMD

| | Account | Debit | Credit |
|--|---------|-------|--------|
| Dr | DirectPay settlement received (`PLATFORM_FUND_TRANSFERS`) | 20,000.00 | |
| Cr | Digital payments clearing | | 20,000.00 |

This is an **asset ↔ asset** move. It does **not** create new sales.

---

# Part C — Finance & double-entry accounting

## C1. Chart of accounts

**Path:** Finance → Chart of accounts  

| Category | Increases with | Examples |
|----------|----------------|----------|
| ASSET | Debit | Cash, clearing, bank |
| LIABILITY | Credit | Wages payable, owner drawing/fund |
| EQUITY | Credit | Share capital |
| REVENUE | Credit | sales (`200`), other Revenue (`260`) |
| EXPENSE | Debit | COGS, fees, rent, utilities |

### Main system accounts

| Code | Name | Category |
|------|------|----------|
| `CASH_ON_HAND` | Cash on hand — POS & counter | ASSET |
| `MERCHANT_WALLET_CLEARING` | Digital payments clearing | ASSET |
| `MOBILE_MONEY` | Mobile money received | ASSET |
| `PLATFORM_FUND_TRANSFERS` | DirectPay settlement received | ASSET |
| `QR_WALLET_FEES` | Wallet processing fees | EXPENSE |
| `200` | sales | REVENUE |
| `260` | other Revenue | REVENUE |
| `310` | Cost of goods sold | EXPENSE |
| `404` | Bank Fees | EXPENSE |
| `429` | General Expense | EXPENSE |
| `445` | light, power, heating | EXPENSE |
| `469` | Rent | EXPENSE |
| `620` | prepayments | ASSET |
| `803` | wages payable | LIABILITY |
| `880` / `881` | Owner drawing / fund introduce | LIABILITY |
| `970` | Owner share capital | EQUITY |

You can add your own accounts (e.g. a **BANK** account for Trust Bank).

### Migrating balances from another system

When you move onto DirectPay with cash, bank, or other balances already on hand:

1. Create the account (or open an existing one) under **Finance → Chart of accounts**.
2. Enter an **Opening balance** on create, or use **Opening** on the account row.
3. Pick an **offset account** (defaults to Owner share capital `970`) and optional as-of date.
4. Approve the resulting journal under **Finance → Journals / Transaction journal**.

Until approved, the amount does not appear on GL, P&L, or the balance sheet. Opening balances are additive (they post the amount you enter; they do not force the account to an absolute total).

**Example — bank opening 25,000.00 GMD**

| | Account | Debit (GMD) | Credit (GMD) |
|--|---------|-------------|--------------|
| Dr | Your bank account | 25,000.00 | |
| Cr | Owner share capital (`970`) | | 25,000.00 |

## C2. How to recognise Debit and Credit

Every journal must balance: **total Debits = total Credits**.

| If you want to… | Post |
|-----------------|------|
| Increase cash / bank / clearing | **Debit** that asset |
| Decrease cash / bank / clearing | **Credit** that asset |
| Record a sale | **Credit** revenue |
| Record an expense | **Debit** expense |
| Owner puts money in | **Credit** fund introduce (`881`) |

**Memory aid**

- **Assets & Expenses** — Debit to increase  
- **Liabilities, Equity & Revenue** — Credit to increase  

## C3. What creates journals automatically

| Event | Debit | Credit |
|-------|-------|--------|
| POS cash paid | Cash on hand | sales |
| POS wallet paid | Clearing | sales (+ fee expense journal) |
| Invoice marked paid / wallet paid | Settlement asset (cash/bank/clearing) | Invoice line accounts |
| Bill marked paid | Bill line accounts | Settlement asset |
| Settlement completed | DirectPay settlement received | Clearing |

You can also post **manual money in/out**, **bank transfers**, and **general journals**. Prefer **reversals** to correct mistakes — do not erase history.

## C4. Worked month — Bakau Retail Shop (GMD)

| # | What happened | Debit | Credit | Amount |
|---|---------------|-------|--------|--------|
| 1 | POS cash sales | Cash | sales | 22,400 |
| 2a | POS Wave sales | Clearing | sales | 31,600 |
| 2b | Wallet fees | QR_WALLET_FEES | Clearing | 320 |
| 3 | Invoice paid to bank | Bank | sales | 18,000 |
| 4 | Rent + power bill paid | 469 + 445 | Cash | 15,450 |
| 5 | Settlement completed | Settlement received | Clearing | 20,000 |
| 6 | Owner cash introduced | Cash | 881 | 10,000 |
| 7 | Bank charges | Bank Fees 404 | Bank | 250 |

**How an officer reads this**

- **2b fees:** expense up → P&L worse; clearing down. Match to wallet statements.  
- **5 settlement:** no profit change — money moved from clearing to settlement received.  
- **6 owner funds:** capital, **not** sales revenue.

---

# Part D — Reading the books: P&L, GL & statements

## D1. Profit & Loss

**Path:** Finance → Profit & loss · pick from–to dates  

Revenue − COGS = Gross profit → minus operating expenses = **Net profit**.

### Sample P&L — September 2026 (GMD)

| Line | Amount |
|------|--------|
| Sales (`200`) | 72,000.00 |
| **Total revenue** | **72,000.00** |
| Cost of goods sold | 0.00 |
| **Gross profit** | **72,000.00** |
| Wallet fees | 320.00 |
| Rent | 12,000.00 |
| Utilities | 3,450.00 |
| Bank fees | 250.00 |
| **Total expenses** | **16,020.00** |
| **Net profit** | **55,980.00** |

Owner capital in and settlement transfers do **not** appear as sales.

### Optional COGS (manual)

If goods sold cost **28,500.00 GMD**:

| | Account | Debit | Credit |
|--|---------|-------|--------|
| Dr | Cost of goods sold (`310`) | 28,500.00 | |
| Cr | Inventory / purchases account | | 28,500.00 |

Gross profit then becomes **43,500.00**.

## D2. GL balance

**Path:** Finance → GL balance · as-of date  

- **ASSET / EXPENSE** balance = Debits − Credits  
- **LIABILITY / EQUITY / REVENUE** balance = Credits − Debits  

### Sample extract (GMD)

| Account | Balance |
|---------|---------|
| Cash on hand | 31,950.00 Dr |
| Digital clearing | 19,280.00 Dr |
| Bank | 59,750.00 Dr |
| DirectPay settlement received | 20,000.00 Dr |
| Wallet fees | 320.00 Dr |
| Rent | 12,000.00 Dr |

## D3. Account statement

**Path:** Finance → Account statement · choose account + dates  

### Sample — Digital payments clearing (GMD)

| Date | Narration | Debit | Credit | Running |
|------|-----------|-------|--------|---------|
| 01-Sep | Opening | | | 8,000 Dr |
| 05-Sep | Wave sales | 12,400 | | 20,400 Dr |
| 12-Sep | Wave sales | 19,200 | | 39,600 Dr |
| 12-Sep | Fees | | 320 | 39,280 Dr |
| 28-Sep | Settlement completed | | 20,000 | **19,280 Dr** |

**Reconcile:** statement closing = GL balance; available to settle = closing − open settlement requests.

## D4. Balance sheet

**Path:** Finance → Balance sheet · as-of date  

Assets (cash, bank, clearing, settlement received, …) = Liabilities + Equity (including year-to-date net profit).

---

# Part E — Daily control, security & staff

## E1. Role scripts

**Cashier** — Confirm product and price → take cash or QR → wait for PAID/receipt → end of shift hand over payments list.  

**Sales clerk** — Correct contact → quotation → send → approve invoice when terms are final → mark paid only when money is in.  

**AP clerk** — Correct expense accounts on bill lines → mark paid only when money left the business.  

**Finance officer** — Daily: journals + cash vs clearing · Weekly: clearing statement vs Settlement screen · Monthly: P&L, GL, balance sheet · Correct with reversals.

## E2. Protect the business (good practice)

1. Enable **two-factor authentication (2FA)** on **Profile** — authenticator app, 6-digit code at login. Strongly recommended for owners and anyone who marks invoices/bills paid.  
2. Invite staff under **Staff**; assign only the features they need under **Configuration**.  
3. Block or terminate leavers immediately.  
4. Keep payment gateway details only on **Merchant API** — do not share keys in chat.  
5. Guest invoice/quotation links and table QR codes behave like cash — do not leave them public if a document should be void.

## E3. If you run more than one business

Use **My businesses** / the header switcher before you sell or post. Each business has its **own** products, staff, and ledger — never mix them.

---

# Part F — Quick cheat sheet (GMD)

| Business event | Debit | Credit | Hits P&L? |
|----------------|-------|--------|-----------|
| Cash POS sale 500 | Cash on hand | sales 200 | Yes — revenue |
| Wave POS sale 500 | Clearing | sales 200 | Yes — revenue |
| Wallet fee 5 | QR_WALLET_FEES | Clearing | Yes — expense |
| Invoice paid 2,000 | Bank | sales | Yes — revenue |
| Bill rent 800 | Rent 469 | Cash/Bank | Yes — expense |
| Settlement 5,000 | Settlement received | Clearing | No |
| Owner cash in 3,000 | Cash | 881 | No — capital |
| Bank charges 50 | Bank Fees 404 | Bank | Yes — expense |
| Bank transfer 1,000 | Receiving bank | Sending bank | No |

---

## Glossary

| Term | Meaning |
|------|---------|
| GMD | Gambian Dalasi |
| DR / Debit | Left side; increases assets and expenses |
| CR / Credit | Right side; increases liabilities, equity, and revenue |
| Clearing | Digital wallet money waiting to be settled |
| Cash basis | Recognise when paid or received |
| Settlement | Move clearing into settlement received / usable funds |
| P&L | Profit and loss for a period |
| GL | General ledger balances |
| COA | Chart of accounts |
| 2FA | Second login step with an authenticator code |

---

*Use this booklet as the shop-floor and accounts handbook: sell, collect, pay suppliers, settle digital funds, and read how every posting affects cash, clearing, and profit in GMD.*
