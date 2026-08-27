# Business Requirements Document

**Product:** APS Wallet  
**Feature:** Merchant hierarchy, roles, and merchant operations  
**Audience:** APS Wallet technology team  
**Status:** Draft  
**Date:** 24 August 2026  
**Version:** 0.2

---

## 1. Purpose

Give **Merchants** the same hierarchical management experience that **Financial Agents** already have, using merchant naming.

Also give each merchant a complete operations set: **balance**, **transaction list and detail**, **refunds**, **single payout**, and **bulk payout**.

---

## 2. Current state

### Financial Agents (keep as the UX model)

Operators already manage a tree:

| Level | Role | UI |
| --- | --- | --- |
| 1 | Super Agent | Expand/collapse, **+ Add Entity** |
| 2 | Head Teller | Nested under Super Agent, **+ Add Entity** |
| 3 | Teller | Nested under Head Teller, **+ Add Entity** |

### Merchants today

- One merchant = one login and one wallet.
- No parent–child tree.
- No outlet under a merchant.
- Balance, transaction detail, refund, and payout (single and bulk) are not available as a coherent merchant operations module.

---

## 3. Scope

**In scope**

- Three-level merchant tree (same interaction as Financial Agents).
- Role-based access on that tree.
- Merchant operations: balance, transactions (list + detail), refunds, single payout, bulk payout.
- Existing merchants migrate in as level-2 **Merchants**.

**Out of scope**

- Changes to the Financial Agents module.
- KYC process redesign (new entities still use existing KYC / approval).

---

## 4. Naming

Do not put agent titles on the merchant screen.

| Agents (do not use) | Merchants | API `entityType` |
| --- | --- | --- |
| FINANCIAL AGENTS | **MERCHANTS** | — |
| Super Agent | **Parent Merchant** | `PARENT_MERCHANT` |
| Head Teller | **Merchant** | `MERCHANT` |
| Teller | **Outlet** | `OUTLET` |

**Parent Merchant** — group or brand HQ. Owns many Merchants.  
**Merchant** — trading business. Has KYC, wallet, and settlement.  
**Outlet** — branch, store, or till under a Merchant. Used to attribute collections and activity.

Display names are free text (for example “Banjul Station”). Entity **type** is always one of the three values above.

### User roles (people, not entities)

| Role | Home entity | Access |
| --- | --- | --- |
| **Group Admin** | Parent Merchant | Full tree; operations on any child Merchant wallet they are allowed to use |
| **Merchant Admin** | Merchant | That Merchant and its Outlets; full operations on that wallet |
| **Outlet Operator** | Outlet | Collect and view that Outlet’s activity only |
| **Viewer** | Any | Read-only on their subtree (balance and transactions; no payout or refund) |

---

## 5. Hierarchy

```
Parent Merchant
 └── Merchant     (1..n)
      └── Outlet  (0..n)
```

| Rule | Detail |
| --- | --- |
| Depth | Three levels. No Merchant under Merchant. No Outlet under Outlet. |
| Add Entity | Parent Merchant adds a Merchant. Merchant adds an Outlet. Outlet is a leaf. |
| IDs | Immutable `merchant_id` and `outlet_id`. |
| Wallet | One wallet per **Merchant**. Outlets share that wallet; they are attribution only. |
| Status | `PENDING_KYC`, `ACTIVE`, `DISABLED`. Operations only when the Merchant is `ACTIVE`. Disabling a Merchant stops collection, refund, and payout for its Outlets. |
| Migration | Existing accounts become Merchants with no parent. They can be attached to a Parent Merchant later. |

### Tree UI

Reuse the Financial Agents pattern:

- Section title **MERCHANTS**.
- Nested tree, connector lines, expand/collapse.
- **+ Add Entity** on Parent Merchant and Merchant nodes.
- Node actions: View, Edit, Disable/Enable, Manage users, and **Operations** (opens balance / transactions / payouts for that Merchant).

---

## 6. Merchant operations

Operations sit on the **Merchant** (the wallet). Opening operations from an Outlet pre-filters transactions to that Outlet. Parent Merchant users pick which Merchant wallet they are acting on.

Required screens under each Merchant:

1. Balance  
2. Transactions (list + detail, with refund)  
3. Payouts (single, bulk, history)

### 6.1 Balance

- Show **available balance** and **currency** for the selected Merchant wallet.
- Manual **Refresh**.
- Show time the balance was retrieved.
- Insufficient-balance checks before payout (single and bulk).
- Group Admin may view a simple roll-up of child Merchant balances (read-only). Payouts always debit a single Merchant wallet.

### 6.2 Transactions (list)

- Filter by **date** (day picker). Optional filters: Outlet, type (collection / payout / refund / reversal), status.
- Paginated list (“load more”).
- Columns: time, transaction id, type, amount, fee, counterparty name, counterparty mobile, Outlet, flags (for example Reversal).
- Row opens **transaction detail**.
- Empty state when there are no movements for the selected day.

### 6.3 Transaction detail

Open from the list by transaction id. Show at least:

- Transaction id  
- Type and status  
- Amount, fee, currency, net  
- Timestamp  
- Counterparty name and mobile  
- Merchant and Outlet  
- Related ids (original collection id on a refund; batch id on a bulk payout row)  
- Whether the movement is a reversal  

From detail (when allowed): **Refund** on a successful collection; **Reverse** on a successful payout.

### 6.4 Refunds

- Refund returns a **received collection** to the customer, including fees.
- Confirm in a modal (transaction id visible). Action cannot be undone from the UI.
- Not offered on reversals, failed transactions, or amounts that are not inbound collections.
- Permission: Merchant Admin or Group Admin only (not Viewer, not Outlet Operator).
- After success, the original transaction and a new refund/reversal row both appear in the list and on detail.
- Refunds debit the Merchant wallet. Block if balance is insufficient, with a clear message.

### 6.5 Single payout

Send money from the Merchant wallet to one recipient.

- Fields: recipient mobile (required), recipient name (required), amount (required), optional client reference, optional note.
- Currency is the Merchant wallet currency. Reject a different currency.
- Confirm before send. Show a result with payout id and status.
- Idempotent on retry (same client reference or server-generated key must not double-pay).
- Persist history: payout id, status, amount, fee, mobile, name, client reference, actor, timestamps.

### 6.6 Bulk payout

Send many payouts as **one batch**.

- Editable rows: recipient mobile, name, amount, optional client reference per row. Add/remove rows.
- Submit creates a **payout batch**. User is taken to **batch detail**.
- Batch detail: batch id, overall status (processing / completed / failed / mixed), counts, and per-row status (succeeded / failed / processing) with error text where a row failed.
- Operator can refresh / poll until the batch is terminal.
- One failed row must not silently hide the others; the batch summary must show succeeded vs failed counts.
- Same currency, balance, and idempotency rules as single payout (balance check against the **sum** of the batch).

### 6.7 Payout history and lookup

- History list: status, amount, recipient, client reference, date, batch (if any).
- Search by client reference and by payout id.
- Payout detail: full record plus **Reverse payout** when the payout succeeded and has not already been reversed.
- Reverse is confirm-gated, permission-gated, and recorded as a reversal on the transaction list.

---

## 7. Functional requirements

### Hierarchy and UI

| ID | Requirement |
| --- | --- |
| M-UI-01 | MERCHANTS tree matches Financial Agents interaction (expand/collapse, indent, **+ Add Entity**). |
| M-UI-02 | Labels are Parent Merchant / Merchant / Outlet only. |
| M-UI-03 | Parent Merchant **+ Add Entity** creates a Merchant. Merchant **+ Add Entity** creates an Outlet. |
| M-UI-04 | Search by name, id, status, type; expand ancestors of a match. |
| M-UI-05 | Node actions include View, Edit, Disable/Enable, Manage users, Operations. |

### Lifecycle

| ID | Requirement |
| --- | --- |
| M-LF-01 | Create Merchant / Outlet; system assigns immutable ids. |
| M-LF-02 | Statuses `PENDING_KYC`, `ACTIVE`, `DISABLED`. Operations only when Merchant is `ACTIVE`. |
| M-LF-03 | Existing merchants migrate as `MERCHANT` with no parent. |

### Roles

| ID | Requirement |
| --- | --- |
| M-RB-01 | User has one home entity and one role. |
| M-RB-02 | Access is the home entity plus children. Outlet Operator does not see sibling Outlets. |
| M-RB-03 | Viewer: balance and transactions only. Refund, payout, and reverse require Admin roles. |

### Balance

| ID | Requirement |
| --- | --- |
| M-BAL-01 | Live available balance and currency for the selected Merchant. |
| M-BAL-02 | Refresh control and retrieved-at timestamp. |
| M-BAL-03 | Payout (single and bulk) blocked when available balance is insufficient. |

### Transactions

| ID | Requirement |
| --- | --- |
| M-TX-01 | List movements for a selected date, with pagination. |
| M-TX-02 | Show time, id, type, amount, fee, counterparty, Outlet, reversal flag. |
| M-TX-03 | Transaction detail with the fields in section 6.3. |
| M-TX-04 | Outlet context filters the list to that Outlet. |

### Refunds

| ID | Requirement |
| --- | --- |
| M-REF-01 | Refund a successful inbound collection, including fees, after confirm. |
| M-REF-02 | Refund not available on reversals or non-collection rows. |
| M-REF-03 | Refund appears as a linked reversal; original id remains on detail. |

### Payouts

| ID | Requirement |
| --- | --- |
| M-PAY-01 | Single payout: mobile, name, amount, optional client reference. |
| M-PAY-02 | Bulk payout: multiple rows submitted as one batch; batch detail with per-row status. |
| M-PAY-03 | Payout history, search by client reference and payout id, payout detail. |
| M-PAY-04 | Reverse a successful payout after confirm. |
| M-PAY-05 | Mutating calls are idempotent (no double pay / double reverse). |
| M-PAY-06 | All payouts and refunds write an audit record (who, when, entity, amount, ids). |

---

## 8. Non-functional

- Tree remains usable with hundreds of Merchants under one Parent.
- Existing merchant logins and collections keep working with no change.
- UI, APIs, and errors use the merchant vocabulary in section 4 only.
- Amounts follow existing APS money rules (whole dalasi unless product already allows otherwise).

---

## 9. Acceptance criteria

1. Operator opens **MERCHANTS**, expands a Parent Merchant, adds a Merchant, then an Outlet, using the same tree controls as Financial Agents.
2. Labels are Parent Merchant / Merchant / Outlet — never Super Agent / Head Teller / Teller.
3. On an active Merchant, operator can refresh **balance**.
4. Operator can list **transactions** for a day, open **detail**, and **refund** a successful collection (with confirm).
5. Operator can send a **single payout** and a **bulk payout** batch, see per-row batch status, look up history, and **reverse** a successful payout.
6. Viewer cannot refund or pay out. Disabled Merchant cannot collect, refund, or pay out.
7. Existing single-login merchants still collect as today.


## 10. Delivery

| Phase | Deliver |
| --- | --- |
| **P1** | MERCHANTS tree, entity types, **+ Add Entity**, migrate existing merchants |
| **P2** | Roles on the tree |
| **P3** | Balance + transactions list and detail |
| **P4** | Refunds |
| **P5** | Single payout, bulk payout, history, reverse |

---

## 11. Example tree (QA / design)

```
MERCHANTS
[-] Parent Merchant    [v]  [+ Add Entity]
    [-] Merchant           [v]  [+ Add Entity]
        [ ] Outlet              [v]
        [ ] Outlet              [v]
    [+] Merchant           [v]  [+ Add Entity]
```

Example display names: Parent Merchant “Kaira Group”, Merchant “Kaira Fuels Ltd”, Outlet “Brikama Station”.

---

