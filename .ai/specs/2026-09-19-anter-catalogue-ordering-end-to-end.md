# Anter — Catalogue Ordering, End to End

| Field | Value |
|-------|-------|
| **Status** | Specification |
| **Created** | 2026-09-19 |
| **Source prototype** | [`.ai/prototypes/anter-system-etapy`](../prototypes/anter-system-etapy/README.md) (revision 2, 44 screens) |
| **Source requirements** | [`docs/anter-system-architektura-docelowa.md`](../../docs/anter-system-architektura-docelowa.md), [`story-map.md`](../prototypes/anter-system-etapy/story-map.md) |
| **Prototype screens** | s33–s39, s42, s15 (portal) · s43, s44, s40, s41, s16, s17 (back office) |
| **Story-map coverage** | US-3.1, US-3.3, US-3.6, US-3.7, US-4.1, US-4.5, US-5.3, US-5.4 · CC-1, CC-2, CC-3, CC-4, CC-5, CC-6 |
| **Modules reused** | `catalog`, `customers`, `customer_accounts`, `portal` (hard) · `sales` calculation service, `attachments` (soft-optional) |
| **Modules new** | `apps/mercato/src/modules/anter_portal`, `apps/mercato/src/modules/anter_orders` |
| **Language** | English, per `.ai/specs/` convention. Polish labels quoted where they are the decided user-facing wording. |

---

## 📝 TLDR

The one path a distributor takes to buy a price-list item, specified end to end: log in to the
portal, browse the catalogue at their contract price, fill a cart, place the order — and then that
order moves through Anter's back office until it ships and is invoiced, with status flowing back to
the portal at each step.

This is deliberately the **narrow** path, and that is what makes it specifiable now. A catalogue
item is by definition one with a list price and warehouse stock, so this order never enters the
configurator, never produces an offer document, and never creates a production order. It is the
only Anter flow that is complete without implementation stages 1, 2 and 4 being finished first.

Two new app modules split along the surface boundary the prototype itself draws:
**`anter_portal`** (everything the distributor touches — catalogue, cart, checkout, order tracking)
and **`anter_orders`** (everything Anter staff touch — orders, stock, fulfilment, release,
shipments, invoices, partner terms). Catalogue records and list prices are read from `catalog`;
the partner is a CRM company from `customers`; identity and portal RBAC come from
`customer_accounts` unchanged. Line and total arithmetic goes through core `sales`'s
`salesCalculationService`, so the portal and the back office cannot disagree about tax or rounding.

The load-bearing correction to the prototype: its release-to-shipping queue (s40) is keyed on
**production orders**, and a catalogue-only order has none. Release is re-keyed on the **order**.

---

## 📐 Decisions (fixed — not re-litigated below)

| # | Decision | Consequence |
|---|---|---|
| D1 | Scope runs portal → back office → shipped **and invoiced** | Five phases, A–E |
| D2 | `catalog`, `customers`, `customer_accounts`, `portal` reused as-is; order handling is custom | §"Why not core `sales`" must justify this, not assert it |
| D3 | Open Mercato owns stock and fulfilment; no external ERP in this flow | CC-2's "ERP is internal" becomes "the back office is internal" |
| D4 | Code lives in app modules under `apps/mercato/src/modules/` | Two modules (D10) |
| D5 | Custom entities, **reused math** — `salesCalculationService` for totals, `catalogPricingService` for unit prices | Core `sales` stays installed as a dependency |
| D6 | **Simple own stock** — one on-hand quantity per catalogue item, no locations or lots | `wms` is not used; §Risks records what that costs |
| D7 | **Custom shipment record only** — manually entered carrier and tracking number, no carrier integration and no seam specified | The split-cost figure in s41 is operator-entered |
| D8 | Invoice is a **record plus an attached file** — number, date, amount, attachment; the PDF is produced elsewhere | Anter keeps issuing invoices wherever it does today |
| D9 | Partner discount is a **percentage held in CRM**, applied through `catalog`'s existing pricing resolver chain | §3.4; `customer_groups` (unimplemented spec) is not pulled in |
| D10 | Two modules: `anter_portal` (distributor-facing), `anter_orders` (staff-facing) | §3.1 |
| D11 | Prototype assumptions **adopted**: A-18 (both prices shown), A-4 (blocked account keeps read access), A-20 (per-line status to the partner), A-16 (no self-registration), A-23 (staff alone decide the split), A-25 (new `wysłane częściowo` status) | §3.6, §6 |
| D12 | A-19 (partner's own reference number) **adopted as an optional field** — the partner may supply one at checkout; it is never required | §3.11 |
| D13 | Portal edge state in scope: **variant unavailable / out of stock**. Empty cart, blocked-at-checkout and product-outside-price-list are **not** drawn as dedicated states | §6; A-4 is specified as behaviour without a bespoke screen |

---

## 📝 Problem Statement

Anter's distributors order small, repeat items by e-mail today. A salesperson reads the mail, looks
up the partner's contract discount, re-keys the lines, and answers "where is it" by walking to
production. The source architecture document justifies the entire B2B portal with exactly this
cost — *"drobne, powtarzalne zamówienia"* — and then describes the portal only through the
configurator, which repeat orders do not need. The prototype's revision 2 closed that gap with a
catalogue path (assumption A-21); this spec is its implementable form.

Three concrete failures the current process has:

1. **Price is re-derived per order.** The partner's discount lives in a partnership agreement and is
   applied by hand. Two salespeople can quote the same SKU differently.
2. **Order status is a phone call.** Nothing external can see where an order is, so every delay
   becomes an inbound question that a person answers from memory.
3. **A partially ready order either ships late or ships by ad-hoc decision.** Nobody sees the cost
   of splitting before deciding, so "let's send what's ready" looks free when it is not.

### Why not core `sales`

D2 fixes that order handling is custom. This section owes an honest justification rather than an
assertion, because core `sales` is shipped, capable, and already owns orders, lines, shipments,
payments and returns. The mismatches, each checked against `packages/core/src/modules/sales`:

| Anter need | Core `sales` today | Verdict |
|---|---|---|
| Order placed straight from a cart | `MUST NOT create orders without a source quote (unless configured)` | **Configuration**, not architecture — the escape hatch exists |
| Order line carries a **fulfilment mode** (from stock / to produce), driving the s44 view | Lines reference products; fulfilment mode is not a line concept | **Real gap** — would be a custom field on every line, queried and filtered constantly |
| Order stays **open** across several partial shipments until the last line ships | Shipments are tracked independently; the open-until-last-line rule is not modelled | **Real gap** |
| Seven statuses including `wysłane częściowo` | Status workflow is configurable and seeded per tenant | **Configuration** |
| No channel concept in Anter's operating model | `MUST scope all documents to a channel` — channel drives pricing, numbering and visibility | **Real friction** — a single synthetic channel would exist only to satisfy the framework |
| Quote → Order → Invoice document flow | Mandated and enforced | **Real friction** for a flow that produces no offer at all (product-owner decision) |

Three of six rows are genuine architectural mismatch and two more are friction, so a custom order
aggregate is defensible — but the honest reading is that this is a **fit** decision, not a
**capability** one. Core `sales` could be bent to this shape. The cost of bending it is a
permanent custom-field surface on lines plus a synthetic channel, against the cost of owning an
order aggregate. D2 chooses the latter.

What that choice does **not** licence is re-implementing arithmetic. D5 keeps
`salesCalculationService` — see §3.5. An earlier framing of "sales will be custom" could be read as
"no dependency on `sales` at all"; this spec deliberately narrows it.

---

## 🔬 Prior art

Checked against B2B commerce platforms that solve the same shape (OroCommerce, Shopware B2B Suite,
Sana Commerce, commercetools B2B, Medusa). Written from working knowledge of these products rather
than a fresh feature audit — treat the specifics as directional.

**What they get right that this spec adopts:**

- **Contract price lists, not ad-hoc discounts.** Every one of them resolves a buyer-specific price
  through a named price list or contract, not a percentage typed per order. §3.4 follows this: the
  discount is an attribute of the partnership, versioned in CRM, and the portal never edits it.
- **Reorder from history.** All of them have it, because B2B repeat rate is the whole business case.
  The prototype's "Ponów zamówienie" (adds to cart, does not re-place the order) matches the
  consensus behaviour, and is adopted verbatim.
- **Showing the discount.** Mixed practice — OroCommerce and Shopware typically show only the
  buyer's price, Sana often shows both. A-18 (D11) chooses both, which is the minority pattern;
  §Risks records what it exposes.

**What they carry that this spec deliberately skips:**

- **Requisition lists / saved carts**, **quick order by SKU paste**, and **buyer approval
  workflows** (order over a threshold routed to a second approver). All three are standard B2B
  portal features and all three are out of scope: Anter's distributors are small teams, and the
  source document describes no approval chain. Worth revisiting once real order volume exists.
- **Credit limit enforcement at checkout.** Every platform has it. The prototype had it and the
  product owner **withdrew** it (A-22). Only the blocked-account flag survives (A-4).
- **Multi-warehouse allocation and backorder promising.** D6 (simple own stock) explicitly defers
  this; §Risks records the ceiling that puts on the design.

---

## 📝 Scope

### In scope

1. Partner logs in to the portal (s33) — existing `customer_accounts` flow, unchanged
2. Partner browses the catalogue, list and tile views, filtered by category, at their contract price (s35, s42)
3. Partner opens a product card, picks a variant, adds to cart (s36)
4. Partner reviews the cart, adjusts quantities, chooses a delivery mode, sees indicative shipping cost, places the order (s37)
5. Order is confirmed to the partner and becomes a commercial object in CRM immediately, per CC-6 (s38)
6. Order appears in the back office at header level (s43) and at line level with its fulfilment mode (s44)
7. Stock-backed lines are allocated and packed; a complete order releases automatically, a partially complete one waits for a staff decision (s40)
8. Staff select lines and quantities to ship now, seeing the cost of splitting before deciding (s41)
9. Shipment, tracking number, waybill and invoice become visible to the partner; the order stays open until the last line ships (s39, s15)
10. Order-derived figures surface on the CRM partner card (s16), and partner terms are edited there (s17)

### Out of scope

- The configurator path and every non-catalogue item (s13, s9–s11). A catalogue item is by definition one carrying a list price; the prototype's own s35 shows the boundary (a sliding gate has no list price and routes to the configurator)
- Production orders, component shortages, purchasing demand (s18–s20) — a catalogue-only order creates none
- Offer documents and the offer approval loop — a catalogue order produces no offer, by product-owner decision
- Lead qualification and the investment track (stage 0); product-base authoring (stage 1) — this spec **consumes** catalogue records; the training module (stage 6)
- Any external ERP integration (D3)
- Payments. The order records payment terms read from CRM; it does not track settlement
- Requisition lists, quick order, buyer approval chains, credit limits, multi-warehouse allocation (§Prior art)

---

## 📝 Architecture

### 3.1 Module split

```
apps/mercato/src/modules/
  anter_portal/     distributor-facing: catalogue browse, product card, cart,
                    checkout, order list/detail, documents.
                    Owns: AnterCart, AnterCartLine.
                    Portal pages + portal API routes (customer auth).

  anter_orders/     staff-facing: order aggregate, stock, fulfilment, release,
                    shipments, invoices, partner terms.
                    Owns: AnterOrder, AnterOrderLine, AnterStockItem,
                          AnterStockAllocation, AnterShipment, AnterShipmentLine,
                          AnterInvoice, AnterPartnerTerms, AnterPartnerGroupDiscount.
                    Backend pages + admin API routes (staff auth).
```

The split follows the surface boundary the prototype draws, not a domain boundary. That has one
consequence worth stating: **the portal reads orders that `anter_orders` owns.** It does so through
a DI-resolved service (`anterOrderReadService`), never by importing entities or joining across
modules — the repository's "no direct ORM relationships between modules" rule is absolute here, so
every cross-module reference is a plain uuid column resolved by a separate fetch.

### 3.2 Dependency direction

```
anter_portal ──reads──▶ anter_orders  (anterOrderReadService, anterPartnerTermsService)
anter_portal ──places─▶ anter_orders  (command: anter_orders.order.place)
anter_portal ──reads──▶ catalog       (products, variants, categories, prices)
anter_portal ──reads──▶ customer_accounts (customer auth context: customerEntityId)

anter_orders ──reads──▶ catalog       (variant snapshot at order time)
anter_orders ──extends▶ customers     (AnterPartnerTerms links to customer_entities)
anter_orders ──uses───▶ sales         (salesCalculationService only)
anter_orders ──emits──▶ event bus     (CRM feedback, portal SSE)
```

`anter_orders` never imports from `anter_portal`. The cart is converted by a command the portal
calls; the order module does not know a cart exists beyond an id it stores for traceability.

### 3.3 Order placement

Checkout is a **command** (`anter_orders.order.place`), not a CRUD write, because it has side
effects that must be undoable as a unit: it snapshots prices, creates the order and lines,
allocates stock, marks the cart converted, and emits the commercial event.

```
POST /api/anter_portal/checkout          (customer auth, portal.orders.create)
  └─ anterCheckoutService.placeOrder(cartId, deliveryMode, notes)
       ├─ load cart + lines                        (anter_portal)
       ├─ assert partner not ordering-blocked      (A-4 → 403 with reason)
       ├─ re-resolve every line price              (§3.4) — prices are re-priced at placement,
       │                                            never trusted from the cart row
       ├─ compute totals via salesCalculationService (§3.5)
       └─ command anter_orders.order.place
            ├─ AnterOrder + AnterOrderLine rows
            ├─ AnterStockAllocation per line (best effort; shortfall → line awaiting_stock)
            ├─ cart.status = 'converted'
            └─ emit anter_orders.order.placed
```

**Re-pricing at placement is deliberate.** A cart row carries a `priceResolvedAt` stamp; if the
contract discount changed since, the order must use the current one. When the re-priced total
differs from what the cart displayed, placement **fails** with the new total rather than silently
charging a different price — the partner re-confirms. This is the one place where being surprising
is safer than being smooth.

### 3.4 Partner pricing

D9 puts the discount in CRM. The implementation has a constraint that is not obvious from the
outside and shapes the whole design:

> `CatalogPricingResolver` has the signature `(rows, ctx) => PriceRow | null | undefined`. It
> **selects among existing rows**; it cannot compute an amount. A discount percentage is not a row.

Resolution: a single service owns the arithmetic, and the registered resolver is a thin wrapper
over it that returns a **synthetic, non-persisted `PriceRow`**.

```ts
// anter_orders/services/anterPartnerPricingService.ts
resolvePartnerPrice(input: {
  productId: string; variantId: string | null
  customerEntityId: string; quantity: number; currencyCode: string; at: Date
}): Promise<{
  listRow: PriceRow | null
  listUnitPriceNet: number | null      // what selectBestPrice returns, untouched
  discountRate: number                 // 0 when the partner has no terms
  partnerUnitPriceNet: number | null   // list × (1 − discountRate), rounded per currency
  priceListCode: string | null         // e.g. 'GR-BRAMKI', for the s35 header
}>
```

The discount rate resolves in this order, first match wins:

1. `AnterPartnerGroupDiscount` for the partner **and** a catalogue category the product belongs to
2. `AnterPartnerTerms.defaultDiscountRate` for the partner
3. `0` — no terms, no discount

This matches the prototype's s17 "warunki handlowe": mixed discounts, per product group, assigned
per partner (assumption A-1, retained).

**The registered resolver.** `registerCatalogPricingResolver` installs a **global** hook — every
`resolveCatalogPrice` call in the whole application passes through it, including back-office
pricing that has nothing to do with partners. It MUST therefore be gated hard:

```ts
registerCatalogPricingResolver(async (rows, ctx) => {
  if (!ctx.customerId) return undefined            // not a buyer context → fall through
  const terms = await termsFor(ctx.customerId)
  if (!terms) return undefined                      // not an Anter partner → fall through
  const base = selectBestPrice(rows, ctx)
  if (!base) return undefined
  return synthesizeDiscountedRow(base, terms)       // never persisted
}, { priority: 100 })
```

Returning `undefined` (not `null`) is load-bearing: `resolveCatalogPrice` treats `null` as a
decided "no price" and stops the chain, while `undefined` continues to the next resolver and then
to the default `selectBestPrice`. Getting this wrong silently removes prices application-wide.

Both prices are shown (A-18), and both come from this one service, so the displayed discount and
the charged discount cannot drift.

### 3.5 Totals

Cart totals and order totals are produced by the same call, on the same inputs:

```ts
salesCalculationService.calculateDocumentTotals({
  documentKind: 'order',
  lines: SalesLineSnapshot[],            // one per cart/order line, kind 'product'
                                          // + one kind 'shipping' for the delivery charge
  context: { tenantId, organizationId, currencyCode },
})
```

`SalesLineSnapshot` and `SalesDocumentAmounts` are plain data types — using them requires no
`SalesOrder` entity, no channel and no quote, which is precisely why D5 is cheap. Shipping is
modelled as a line of `kind: 'shipping'` rather than an order adjustment, so it appears in the
cart breakdown the way s37 shows it.

Anter stores the returned `SalesDocumentAmounts` fields on `AnterOrder`; it never recomputes them.

### 3.6 Statuses

Seven order statuses, extending the source document's six with A-25 (D11):

| Code | Polish label | Meaning |
|---|---|---|
| `placed` | Zamówienie przyjęte | Created from the cart |
| `confirmed` | Potwierdzone | Staff confirmed date and final shipping rate |
| `picking` | Do wydania | Every line allocated, being packed |
| `awaiting_stock` | Oczekuje na towar | At least one line short of stock |
| `shipped_partially` | Wysłane częściowo | Some lines dispatched, order still open |
| `shipped` | Wysłane w całości | Last line dispatched |
| `delivered` | Dostarczone | Terminal |

`shipped_partially` renders in the **warning** token, not success, because shipment is no longer a
terminal state while lines remain — this is the prototype's reasoning and it is retained.

Line statuses: `awaiting_stock` | `allocated` | `packed` | `shipped` | `delivered`. Per-line status
is exposed to the partner (A-20, D11). §Risks records the CC-2 tension this creates.

### 3.7 Release to shipping — the correction

The prototype's s40 queue lists **production orders** (`ZLC-…`) and asks which are complete. A
catalogue-only order has no production order, so for this flow the queue is re-keyed on the
**order**:

- Every line `packed` → the order releases **automatically**, status `picking` → ready to dispatch.
  It appears in the queue as a record, not a task (the prototype's "zwolnione automatem").
- Some lines `packed`, some `awaiting_stock` → the order enters the queue as **"czeka na decyzję"**
  and waits for a human (A-23: staff decide alone; the partner is informed, not asked).
- No line `packed` → listed, muted, not actionable.

What makes a line "not ready" in this flow is **insufficient stock**, not a missing component. The
s41 wording changes accordingly: "oczekuje na komponent" becomes "oczekuje na towar", with the
`expectedRestockAt` date from `AnterStockItem`.

### 3.8 CRM feedback (CC-6)

Order placement is a commercial event, so it creates a CRM object immediately. Subscribers in
`anter_orders` listen to its own events and write to `customers` through that module's public API,
never by direct entity access:

| Event | CRM effect |
|---|---|
| `anter_orders.order.placed` | Activity on the partner company, carrying number, value, line count |
| `anter_orders.order.shipped_partially` / `.shipped` | Activity update |
| `anter_orders.order.delivered` | Activity closed |

The partner card figures (last order date, rolling turnover, order count in period) are computed on
read by `anterPartnerStatsService` and rendered by a widget injected into the CRM company detail
page at spot `crud-form:customers.company` — the same mechanism `customer_accounts` already uses for
its `company-users` widget. Nothing is denormalised into `customers`.

### 3.9 Cross-module dependencies and module-absent behaviour

Every touchpoint names its sanctioned mechanism, its owner, and what happens when the peer is not
installed. The consumer always owns the glue.

| Peer | Mechanism | Owner | If the peer is absent |
|---|---|---|---|
| `catalog` | Direct service use (`catalogPricingService`) + FK ids | `anter_*` | **Hard dependency.** Declared in both modules' `index.ts`. Without a catalogue there is nothing to sell; failing at boot is correct |
| `customers` | Entity extension via `defineLink` + public API for activities | `anter_orders` | **Hard dependency.** The partner *is* a CRM company |
| `customer_accounts` / `portal` | Portal auth context + page contribution | `anter_portal` | **Hard dependency.** No identity, no portal |
| `sales` | `salesCalculationService` resolved from DI | `anter_orders` | **Soft-optional.** Resolved in a `try/catch`; if absent, `anterFallbackCalculationService` (net × qty, single tax rate, no adjustments) takes over and the back office logs a warning at boot. D5's benefit is shared arithmetic, not a hard coupling — a deployment that disables `sales` must still be able to take orders |
| `attachments` | Attachment ids on invoice and shipment | `anter_orders` | **Soft-optional.** Without it, `attachment_id` stays null and the document columns render "—". Recording an invoice number still works |
| `events` | `createModuleEvents` + persistent subscribers | `anter_orders` | Platform infrastructure, always present |

The soft-optional peers are resolved with `tryResolve`-style guards, never a hard `requires`, and
each has a test asserting the module still boots and orders still place with the peer disabled.
Verify against `packages/core/src/__tests__/module-decoupling.test.ts`.

### 3.10 Access control

**Staff features** (`anter_orders/acl.ts`), assigned to `admin` and `superadmin` via `setup.ts`
`defaultRoleFeatures`:

| Feature | Grants |
|---|---|
| `anter_orders.view` | Read orders, lines, shipments, invoices, stock |
| `anter_orders.manage` | Confirm orders, edit lines, record invoices |
| `anter_orders.fulfil` | Allocate stock, mark packed |
| `anter_orders.release` | Release to shipping, create and dispatch shipments (s40, s41) |
| `anter_orders.terms.manage` | Edit partner terms and the blocking flag (s17) |

Release is a **separate** feature from `manage` deliberately: deciding to split a shipment has a
commercial consequence for the partner, and the prototype's A-23 puts that decision with a specific
role rather than with anyone who can edit an order.

**Portal features** (`anter_portal/acl.ts`), following the `portal.<area>.<action>` convention:
`portal.catalog.view`, `portal.orders.view`, `portal.orders.create`. The first two are already
seeded on the stock `buyer` and `viewer` roles; `portal.orders.create` is new and is granted to
`buyer` only (a `viewer` browses and tracks but cannot order — the prototype's "konto podglądowe").
It is declared in `anter_portal/setup.ts` `defaultCustomerRoleFeatures` so `seedDefaults` merges it
into new tenants, and existing tenants replay it with:

```bash
yarn mercato customer_accounts sync-customer-role-acls
```

Note `CustomerRbacService` caches ACLs for five minutes, so a fresh grant is not instantly visible
to a signed-in portal user — the runbook step above is not optional after Phase A ships.

**Declaration shape.** Every API route file exports `metadata` with **per-method**
`requireAuth` / `requireFeatures` (staff) or `requireCustomerAuth` / `requireCustomerFeatures`
(portal) — never a top-level `export const requireAuth`. Backend pages declare their guards in
`page.meta.ts` the same way.

**Tenant isolation.** Every query in both modules filters by `organization_id` **and** `tenant_id`,
and every portal query additionally filters by the `customerEntityId` taken from the customer JWT.
No scope value is ever read from a request parameter. This is the rule the `404`-not-`403` behaviour
in §API rests on.

---

### 3.11 Partner reference number (A-19)

The partner may supply **their own** order reference at checkout — the number under which this
purchase exists in their system, so a delivery can be matched to the job they are serving. It is
**optional**: supplied or not, the order places identically.

- Captured once, on the cart, at checkout (`anter_carts.partner_reference`), and frozen onto the
  order at placement (`anter_orders.partner_reference`). It is never editable afterwards by the
  partner — a reference that changes after the fact defeats its purpose.
- Carried onto every document Anter produces for the order: invoice, waybill, packing note. Where
  a document is produced outside this system (D8), the reference travels on the order record the
  document is generated from.
- Free text, trimmed, `maxLength: 64`, no format imposed. Anter cannot know a partner's numbering
  scheme, and validating it would reject correct input.
- Not unique and not an identifier in this system. Two partners may legitimately use the same
  string, and one partner may reuse theirs. `order_number` remains the only key (CC-4).
- **Absent means absent.** When no reference is supplied, every surface omits the field entirely
  rather than rendering an empty row or a dash. The s38 confirmation sentence about the reference
  appearing on documents is conditional on there being one.

Back-office staff can search and filter orders by it (s43), which is the other half of its value:
when a partner rings about "our order 114", the answer is one search rather than a date-range hunt.

---

## 📝 Data Model

All tables carry `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at` and a
uuid primary key; those columns are omitted below. Every entity is user-editable, so **optimistic
locking is on by default**: `updated_at` is returned by list/detail APIs and `CrudForm` derives the
lock header from `initialValues.updatedAt`.

### `anter_portal`

**`anter_carts`** — one active cart per (customer user, organization).

| Column | Type | Notes |
|---|---|---|
| `customer_entity_id` | uuid | CRM company (the partner). Plain FK id, no ORM relation |
| `customer_user_id` | uuid | Portal user who owns the cart |
| `currency_code` | text | |
| `delivery_mode` | text | `partner_warehouse` \| `end_customer` \| `self_collection` (s37) |
| `delivery_address_id` | uuid null | `customer_addresses` id when mode is `partner_warehouse` |
| `delivery_address_snapshot` | jsonb null | Free address when mode is `end_customer` |
| `partner_reference` | text null | A-19 (D12). Optional, max 64 chars, supplied at checkout |
| `notes` | text null | |
| `status` | text | `active` \| `converted` \| `abandoned` |
| `converted_order_id` | uuid null | Traceability only |

Partial unique index on `(customer_user_id, organization_id) WHERE status = 'active' AND deleted_at IS NULL`.

**`anter_cart_lines`**

| Column | Type | Notes |
|---|---|---|
| `cart_id` | uuid | |
| `product_id`, `product_variant_id` | uuid | catalog ids |
| `sku`, `name_snapshot`, `variant_snapshot` | text / jsonb | Display without a catalog round-trip |
| `quantity` | numeric(16,4) | |
| `unit_code` | text | |
| `list_unit_price_net` | numeric(16,4) | A-18: shown next to the partner price |
| `partner_unit_price_net` | numeric(16,4) | |
| `discount_rate` | numeric(7,4) | |
| `currency_code` | text | |
| `price_resolved_at` | timestamptz | Drives re-pricing at placement (§3.3) |

### `anter_orders`

**`anter_orders`**

| Column | Type | Notes |
|---|---|---|
| `order_number` | text | Unique per tenant. `ZAM-YYYY-NNNN` |
| `customer_entity_id`, `customer_user_id` | uuid | |
| `source` | text | `catalog` \| `configurator` \| `b2b_panel` \| `crm_offer`. Always `catalog` in this spec's scope; the column exists because s43 shows it and later stages fill it |
| `status` | text | §3.6 |
| `currency_code` | text | |
| `delivery_mode`, `delivery_address_snapshot` | text / jsonb | Frozen from the cart |
| `payment_terms_days` | integer | Snapshotted from CRM terms at placement (CC-3) |
| `subtotal_net_amount`, `discount_total_amount`, `shipping_net_amount`, `tax_total_amount`, `grand_total_net_amount`, `grand_total_gross_amount` | numeric(16,4) | Straight from `SalesDocumentAmounts` (§3.5) |
| `partner_reference` | text null | Frozen from the cart at placement; carried onto every document (§3.11) |
| `source_cart_id` | uuid null | |
| `placed_at`, `confirmed_at`, `closed_at` | timestamptz null | |

**`anter_order_lines`**

| Column | Type | Notes |
|---|---|---|
| `order_id`, `line_number` | uuid / integer | |
| `product_id`, `product_variant_id`, `sku`, `name_snapshot`, `variant_snapshot` | | Snapshotted — a later catalogue edit must not rewrite history |
| `quantity`, `unit_code` | numeric / text | |
| `list_unit_price_net`, `unit_price_net`, `discount_amount`, `tax_rate`, `net_amount`, `gross_amount` | numeric(16,4) | |
| `fulfilment_mode` | text | `stock` \| `production`. **Always `stock` in this scope.** The column exists because s44's whole point is the distinction, and a mixed order (s44's ZAM-2026-1164) is the next stage's work |
| `line_status` | text | §3.6 |
| `shipped_quantity` | numeric(16,4) | |
| `expected_at` | timestamptz null | Shown to the partner when `awaiting_stock` (A-20) |

**`anter_stock_items`** — D6, simple stock.

| Column | Type | Notes |
|---|---|---|
| `product_id`, `product_variant_id` | uuid | Unique per (variant, organization) |
| `sku`, `unit_code` | text | |
| `on_hand_quantity` | numeric(16,4) | **The only mutable counter** |
| `expected_restock_at` | timestamptz null | Feeds the s35 availability column and s41's date |

**`anter_stock_allocations`** — the reservation ledger.

| Column | Type | Notes |
|---|---|---|
| `order_line_id`, `stock_item_id` | uuid | |
| `quantity` | numeric(16,4) | |
| `status` | text | `allocated` \| `packed` \| `shipped` \| `released` |

> **Available quantity is derived**, never stored: `on_hand − Σ(quantity WHERE status IN ('allocated','packed'))`.
> Two counters that must agree is the classic drift bug; one counter plus a ledger cannot drift, and
> it gives release/cancel a real undo path (set allocations to `released`).

**`anter_shipments`**

| Column | Type | Notes |
|---|---|---|
| `order_id`, `shipment_number`, `sequence_number` | uuid / text / integer | "Przesyłka 1 z 2" |
| `status` | text | `planned` \| `dispatched` \| `delivered` |
| `carrier_name`, `tracking_number` | text null | Manually entered (D7) |
| `weight_kg`, `package_count` | numeric / integer | Operator-entered; feeds s41's summary |
| `shipping_cost_net` | numeric(16,4) | Operator-entered; feeds the split-cost comparison |
| `waybill_attachment_id` | uuid null | `attachments` module |
| `dispatched_at`, `delivered_at` | timestamptz null | |

**`anter_shipment_lines`** — `shipment_id`, `order_line_id`, `quantity`.

**`anter_invoices`** — D8. `order_id`, `invoice_number`, `issued_at`, `net_amount`, `gross_amount`, `currency_code`, `attachment_id`.

**`anter_partner_terms`** — entity extension of `customers.customer_entity`, declared in
`anter_orders/data/extensions.ts` via `defineLink`. One row per partner company.

| Column | Type | Notes |
|---|---|---|
| `customer_entity_id` | uuid | Unique per organization |
| `partner_number` | text null | `KTR-10422` in the prototype — CC-4's shared contractor number |
| `price_list_code` | text null | `GR-BRAMKI`, shown in the s35 header |
| `default_discount_rate` | numeric(7,4) | |
| `payment_terms_days` | integer | |
| `is_ordering_blocked` | boolean | A-4 |
| `blocked_reason` | text null | **Never exposed to the portal** — staff-facing only |

**`anter_partner_group_discounts`** — `partner_terms_id`, `catalog_category_id`, `discount_rate`.

### Sensitive data

`delivery_address_snapshot` on both cart and order contains a postal address, and when
`delivery_mode = 'end_customer'` it is the address of a third party the partner serves. Addresses
are GDPR-relevant personal data in this repository's convention, so both columns MUST be declared
in `anter_portal/encryption.ts` and `anter_orders/encryption.ts` `defaultEncryptionMaps`, and every
read MUST go through `findWithDecryption` / `findOneWithDecryption`. No other new column is
personal data: the partner is a company, and the ordering user is already owned by
`customer_accounts`.

`partner_reference` (§3.11) and `order_number` are **business identifiers, not personal data**, and
are deliberately left unencrypted. The review checklist lists "document numbers" among
encryption-map candidates, so the exception is stated rather than silently taken: both columns must
support back-office search and partial matching (s43), which an encrypted column cannot do without
a `hashField` that only serves exact equality. A tenant that judges the partner reference sensitive
can add the encryption map plus `hashField` and accept exact-match-only search — the escape hatch
exists, it is just not the default.

### Migrations

Two migration sets, one per module, generated with `yarn db:generate` and reviewed together with
each module's `.snapshot-open-mercato.json`. No existing table is altered — `anter_partner_terms`
links to `customer_entities` by uuid without a foreign-key constraint, per the cross-module rule.

---

## 📝 API Contracts

Standard CRUD is not documented here; it is `makeCrudRoute` with `indexer: { entityType }` and zod
validators in `data/validators.ts`, following the `customers` reference module. Only the endpoints
whose shape is not derivable from that are specified.

### Portal (`anter_portal`) — customer auth

| Method · Path | Feature | Notes |
|---|---|---|
| `GET /api/anter_portal/catalog` | `portal.catalog.view` | Paged, `categoryId` filter, `q` search. Returns per item: `listUnitPriceNet`, `partnerUnitPriceNet`, `discountRate`, `availability` (`in_stock` \| `expected` + date \| `quote_only`). An item with no list price returns `quote_only` and **no prices** — the s35 sliding-gate row |
| `GET /api/anter_portal/catalog/[productId]` | `portal.catalog.view` | Variants with per-variant price and availability |
| `GET /api/anter_portal/cart` | `portal.orders.view` | Active cart with recomputed totals |
| `POST /api/anter_portal/cart/lines` | `portal.orders.create` | Add. Rejects `quote_only` items (CC-5) and quantities above available stock (D13) |
| `PUT /api/anter_portal/cart/lines/[id]` | `portal.orders.create` | Quantity change; re-prices the line |
| `PUT /api/anter_portal/cart` | `portal.orders.create` | Delivery mode, notes, and the optional `partnerReference` (§3.11) |
| `DELETE /api/anter_portal/cart/lines/[id]` | `portal.orders.create` | |
| `POST /api/anter_portal/cart/reorder` | `portal.orders.create` | Copies an order's lines into the cart at **current** prices. Never places an order |
| `POST /api/anter_portal/checkout` | `portal.orders.create` | §3.3. Accepts optional `partnerReference` (max 64, trimmed; omitted when blank). `409` on price change, `403` on blocked account |
| `GET /api/anter_portal/orders` | `portal.orders.view` | Via `anterOrderReadService` |
| `GET /api/anter_portal/orders/[id]` | `portal.orders.view` | Lines with per-line status (A-20), shipments, documents |

Every portal response is scoped to the caller's `customerEntityId` taken from the customer JWT —
never from a request parameter. An order id belonging to another partner returns `404`, not `403`.

**Checkout conflict body** (`409`), so the client can show the difference rather than a generic error:

```json
{ "error": "price_changed",
  "previousGrandTotalNet": "12335.36",
  "currentGrandTotalNet": "12489.10",
  "changedLines": [{ "lineId": "…", "previousUnitPriceNet": "311.60", "currentUnitPriceNet": "318.20" }] }
```

**Blocked account body** (`403`): `{ "error": "ordering_blocked" }` — and nothing else. The reason
is staff-facing (A-4); leaking "overdue invoice 12/2026" to the portal is a CC-2 violation.

### Back office (`anter_orders`) — staff auth

CRUD for orders, stock items, shipments, invoices and partner terms is `makeCrudRoute`. The
non-derivable operations are commands:

| Command | Effect | Undo |
|---|---|---|
| `anter_orders.order.place` | §3.3 | Delete order + lines, release allocations, cart back to `active` |
| `anter_orders.order.confirm` | `placed` → `confirmed`, sets final shipping cost | Back to `placed`, restores previous shipping |
| `anter_orders.stock.allocate` | Allocates a line against available stock | Allocations → `released` |
| `anter_orders.shipment.create` | s41: creates a shipment from selected lines and quantities, marks allocations `shipped`, recomputes order and line status | Delete shipment, allocations back to `packed`, recompute status |
| `anter_orders.shipment.dispatch` | Records carrier, tracking number, dispatch date | Back to `planned`, clears tracking |
| `anter_orders.invoice.record` | Records number, date, amounts, attachment | Delete invoice row (the file stays in `attachments`) |

Every command carries `before`/`after` snapshots and is guarded by
`enforceCommandOptimisticLock`, so a concurrent edit of the same order surfaces as a `409`
conflict rather than a lost update.

**Custom write routes run the mutation guard registry.** `POST /checkout` and every command
endpoint is a non-`makeCrudRoute` write, so each maps to a `create` / `update` / `delete` action,
collects registered guards, appends `bridgeLegacyGuard(container)` when present, calls
`runMutationGuards(...)` with `{ userFeatures }` before mutating, merges `modifiedPayload`, and runs
the returned `afterSuccessCallbacks` afterwards — catching and logging callback failures rather than
failing the write. Skipping this is how a custom route silently bypasses platform-wide guards.

**Irreversible side effects.** Two effects of `anter_orders.order.place` cannot be undone by its
undo path: the confirmation e-mail to the partner, and the CRM activity once written. Undo
therefore *compensates* rather than erases — it appends a cancellation activity to CRM and sends no
second e-mail. The command's definition states this explicitly so no caller assumes a clean
reversal.

### Events

Declared with `createModuleEvents`. `clientBroadcast` bridges to the back-office SSE stream,
`portalBroadcast` to the partner's.

| Event | clientBroadcast | portalBroadcast |
|---|---|---|
| `anter_orders.order.placed` | yes | yes |
| `anter_orders.order.confirmed` | yes | yes |
| `anter_orders.order.shipped_partially` | yes | yes |
| `anter_orders.order.shipped` | yes | yes |
| `anter_orders.order.delivered` | yes | yes |
| `anter_orders.stock.depleted` | yes | no |

`stock.depleted` does **not** broadcast to the portal: which item ran out is internal (CC-2).

---

## 📝 UI/UX

Only what is not standard `DataTable` / `CrudForm` work is described. The canonical mechanisms are
not optional here:

- Lists are `<DataTable entityId apiPath columns />` with stable `entityId` values
  (`anter_orders.order`, `anter_orders.order_line`, `anter_orders.shipment`) so widget injection of
  columns, row actions, bulk actions and filters keeps working.
- Forms are `<CrudForm>` with `createCrud` / `updateCrud` / `deleteCrud`, throwing
  `createCrudFormError` for field-level errors. No raw `<form>`.
- **Every write that is not a `CrudForm` submit** — release to shipping, create shipment, dispatch,
  allocate, record invoice, and every portal cart mutation — is wrapped in
  `useGuardedMutation(...).runMutation(...)` with `retryLastMutation` passed in the injection
  context. These are the majority of this feature's writes, so this is the rule, not the exception.
- HTTP goes through `apiCall` / `apiCallOrThrow` / `readApiResultOrThrow`. Never raw `fetch`.
- Async states use `LoadingMessage` / `ErrorMessage` from `@open-mercato/ui/backend/detail`;
  empty lists use `EmptyState` or `DataTable`'s `emptyState` prop.
- Inline status uses `<Alert variant>`, entity status uses `<StatusBadge>`, toasts use `flash(...)`,
  destructive confirmations use `useConfirmDialog()`.
- Icons are `lucide-react` in page body at `size-4` / `size-5`; `page.meta.ts` icons follow the
  `React.createElement('svg', …)` pattern. No inline `<svg>` in page body.
- Every user-facing string goes through `useT()` client-side or `resolveTranslations()`
  server-side, with keys under `anter_portal.*` / `anter_orders.*`. Purely internal throws are
  prefixed `[internal]`.
- Status colours use semantic tokens only — `shipped_partially` renders as
  `<StatusBadge>` in the warning role (`bg-status-warning-bg` / `text-status-warning-text`),
  `delivered` in the success role, `awaiting_stock` in the info role. No `text-amber-*`,
  no `dark:` overrides, no arbitrary sizes.

### Portal pages (`anter_portal/frontend/[orgSlug]/portal/…`)

Contributed exactly as `warranty_claims` does: `page.tsx` beside `page.meta.ts` declaring
`requireCustomerAuth: true`, `requireCustomerFeatures`, and a `nav` entry.

| Path | Screen | Notes |
|---|---|---|
| `catalog/page.tsx` | s35 + s42 | One page, a **view toggle** between list and tiles. The toggle is not persisted between visits. Category filter is a select over the six real categories, default "Wszystkie kategorie". Tile view shows a placeholder where a product photo belongs — §Risks records that this view is only worth shipping once photos exist (A-26) |
| `catalog/[productId]/page.tsx` | s36 | Variant picker; price and availability update per variant |
| `cart/page.tsx` | s37 | Line table with quantity edit, delivery-mode radio, the optional "Twój numer zamówienia" field, notes, and the summary panel: list value → partner discount → net lines → indicative shipping → net total → VAT → gross total. The reference field is labelled optional and carries a short hint explaining what it is for |
| `orders/page.tsx` | s15 | Order list. Invoice column shows a download **only when an invoice exists**; otherwise `—`. A "Ponów" action per row |
| `orders/[id]/page.tsx` | s38 + s39 | Confirmation banner on first view after placement, then the standing detail: seven-step timeline, lines with per-line status, shipments each with its own tracking number and waybill, documents, "Ponów zamówienie". The partner reference appears in the header subtitle and in the confirmation sentence **only when one was supplied** (§3.11) |

The three price figures the partner sees — list, discount, theirs — come from one service (§3.4),
so the catalogue, the cart and the order cannot show three different discounts.

### Back-office pages (`anter_orders/backend/anter_orders/…`)

| Path | Screen | Notes |
|---|---|---|
| `orders/page.tsx` | s43 | One **order** per row: number, partner reference, partner, placed date, line count, net value, source, status. KPI row above. Partner filter, and free-text search matching both `order_number` and `partner_reference` (§3.11) |
| `orders/[id]/page.tsx` | — | Detail with lines, allocations, shipments, invoice |
| `fulfilment/page.tsx` | s44 | One **order line** per row, with fulfilment mode. Filter tabs: all / production only / stock only / awaiting order. In this scope every line is `stock`, so the production tabs render an empty state rather than being hidden — the columns are the point |
| `releases/page.tsx` | s40 | The re-keyed queue (§3.7). Auto-released orders stay listed as a record, visibly not a task; orders with nothing packed are muted |
| `releases/[orderId]/page.tsx` | s41 | Line selection with quantities, blocked lines disabled and dated, the shipment summary (weight, packages), the **split-cost comparison**, and a "what the partner will see" panel |
| `shipments/page.tsx` | — | Shipment list with dispatch action |

The split-cost panel deserves its own note. Its whole purpose is that "let's send what's ready"
must not look free. It shows: quoted shipping for the whole order, this shipment's cost, an
estimate for the remainder, and the difference. Under D7 all three are operator-entered, which
weakens it — §Risks records this.

`Cmd/Ctrl+Enter` submits and `Escape` cancels in every dialog; every icon-only button carries an
`aria-label`.

### Frontend architecture contract

Portal pages are React Server Components by default. The `"use client"` ledger is:

| Client file | Why |
|---|---|
| `catalog/CatalogView.tsx` | View toggle, category filter, add-to-cart |
| `cart/CartEditor.tsx` | Quantity edits, recompute, submit |
| `orders/[id]/OrderTimeline.tsx` | Subscribes to portal SSE for live status |
| `releases/[orderId]/SplitShipmentForm.tsx` | Line selection and quantity arithmetic |

No provider is added at portal root. Data is fetched server-side and passed as props; client
components mutate through `apiCall` and revalidate. Hydration is asserted by an integration test
per interactive page.

---

## 📝 Edge Cases & Failure Scenarios

| Scenario | Behaviour |
|---|---|
| **Variant out of stock at add-to-cart** (D13, in scope) | Add is rejected with the available quantity and `expectedRestockAt`. The catalogue row already showed `expected` rather than `in_stock`, so this is a confirmation, not a surprise |
| **Stock falls between add-to-cart and checkout** | Placement succeeds; the short line is created with `line_status = awaiting_stock` and the order with `awaiting_stock`. The partner sees a date, never a reason (CC-2) |
| **Price changed since the cart was filled** | Checkout returns `409` with the per-line difference (§API). Nothing is placed. The partner re-confirms |
| **Partner blocked for overdue payment** (A-4) | Catalogue and orders remain readable; documents remain downloadable; `POST /checkout` returns `403 ordering_blocked`. No dedicated screen (D13) — the cart's submit button is disabled with a short notice |
| **Product has no list price** | Returned as `quote_only` with no prices, not orderable, routed to the configurator (CC-5). This is the s35 sliding-gate row |
| **Concurrent checkout of the same cart** | Optimistic lock on the cart; the second request gets `409` |
| **Two staff releasing the same order** | Command-level optimistic lock on the order; the second gets `409` and re-reads |
| **Stock oversold by concurrent placement** | Allocation is written inside the placement transaction and re-reads available quantity under a row lock on `anter_stock_items`. Losing requests allocate what remains and mark the shortfall `awaiting_stock`; they do **not** fail |
| **Last line ships** | Order → `shipped`, `closed_at` set. Until then it stays `shipped_partially` and open, however many shipments exist |
| **Invoice attachment upload fails** | The invoice row is not created. Recording number and file is one operation; a numbered invoice with no document is worse than no row |
| **CRM write fails after placement** | The order stands. The CRM subscriber is **persistent** and retried; the commercial event is not lost, only late. Placement must never be rolled back because CRM was briefly unavailable |
| **No partner reference supplied** | The field is omitted everywhere — no empty row, no dash, and the s38 sentence about the reference appearing on documents is not rendered at all (§3.11) |
| **Partner reference reused, or shared by two partners** | Accepted. It is not an identifier in this system and carries no uniqueness constraint; `order_number` remains the only key (CC-4) |
| **Catalogue record edited after ordering** | The order is unaffected — name, SKU, variant and prices are snapshotted on the line |

---

## 📝 Performance, Indexing and Caching

### The N+1 that this design would otherwise have

`GET /api/anter_portal/catalog` returns a page of products, and every one needs a resolved partner
price. Resolving them one at a time is a per-item round trip through the resolver chain — the
textbook N+1, and the single hottest path in the whole spec.

`catalog/lib/pricing.ts` already ships the answer: **`resolveCatalogPriceBatch(entries, options)`**.
The catalogue endpoint MUST fetch all candidate price rows for the page in one query, then call
`resolveCatalogPriceBatch` once. Expected query count for a 24-item catalogue page: **4** — products,
price rows, category assignments, stock items — regardless of page size. An implementation that
issues 24 price queries is a defect, and the integration test asserts the query count rather than
just the response body.

The same rule applies to the cart (all lines re-priced in one batch) and to placement.

### Indexes

| Table | Index | Access pattern |
|---|---|---|
| `anter_carts` | `(customer_user_id, organization_id) WHERE status='active' AND deleted_at IS NULL` (unique, partial) | Point lookup — the active cart |
| `anter_cart_lines` | `(cart_id)` | Range scan |
| `anter_orders` | `(organization_id, tenant_id, status)` | Range scan — back-office list by status |
| `anter_orders` | `(customer_entity_id, placed_at DESC)` | Range scan — portal order list and partner stats |
| `anter_orders` | `(organization_id, order_number)` unique | Point lookup |
| `anter_orders` | `(organization_id, partner_reference)` where not null | Point lookup — the s43 "our order 114" search (§3.11) |
| `anter_order_lines` | `(order_id, line_number)` | Range scan |
| `anter_order_lines` | `(organization_id, line_status, fulfilment_mode)` | Range scan — the s44 fulfilment view and its filter tabs |
| `anter_stock_items` | `(product_variant_id, organization_id)` unique | Point lookup during pricing and allocation |
| `anter_stock_allocations` | `(stock_item_id, status)` | Aggregate — derived available quantity |
| `anter_stock_allocations` | `(order_line_id)` | Range scan |
| `anter_shipments` | `(order_id, sequence_number)` | Range scan |
| `anter_partner_terms` | `(customer_entity_id, organization_id)` unique | Point lookup on every priced request |
| `anter_partner_group_discounts` | `(partner_terms_id, catalog_category_id)` | Point lookup in discount resolution |

**Derived available quantity** is an aggregate over `anter_stock_allocations`, which grows without
bound as orders accumulate. Mitigation: allocations reaching `shipped` or `released` are excluded by
the partial index `(stock_item_id) WHERE status IN ('allocated','packed')`, so the aggregate scans
only live rows. A monthly worker archives terminal allocations older than a year.

**Pagination.** All list endpoints cap `pageSize` at 100 and default to 24 (catalogue) or 50
(back office). The back-office order and line lists use keyset pagination on
`(placed_at DESC, id)` rather than `OFFSET`, because the fulfilment view is the one list expected to
grow past tens of thousands of rows.

### Caching

Cache is resolved from DI (`container.resolve('cache')`) — never a raw Redis or SQLite client.

| Cached read | Key | TTL | Invalidated by |
|---|---|---|---|
| Partner terms + group discounts | `anter:terms:<orgId>:<customerEntityId>` | 5 min | `anter_partner_terms` / `anter_partner_group_discounts` write |
| Catalogue page (products, categories, list prices) | `anter:catalog:<orgId>:<categoryId>:<page>:<q>` | 60 s | `catalog.product.updated`, `catalog.product.deleted` |
| Partner-card statistics (s16) | `anter:stats:<orgId>:<customerEntityId>` | 10 min | `anter_orders.order.placed`, `.shipped`, `.delivered` |

Every key carries `tenant:<id>` and `org:<id>` tags, so a tenant-wide purge is one call and
cross-tenant bleed is structurally impossible.

**What is never cached: prices and stock.** A partner price depends on terms that a salesperson can
change mid-session (CC-3 requires the change to take effect immediately, "bez ponownego logowania"),
and an available quantity that is stale is an oversell. The catalogue page cache holds the *product
and list-price* layer only; the partner price and availability are resolved per request on top of
it. Cold start falls through to the query with no behavioural difference.

**Write-path invalidation.** Every command in §API lists its cache tag invalidations as part of its
definition; a command that mutates terms, stock or orders without an invalidation entry fails review.

---

## 📝 Risks & Impact Review

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **The pricing resolver registry is module-local, not `globalThis`-backed** (`catalog/lib/pricing.ts`). Under a multi-instance module topology, a resolver registered by an app module can be invisible to resolution running in another instance — silently, with no error, and the symptom is partners charged list price | **Critical** | An integration test that resolves a price through the public API and asserts the partner discount was applied — not a unit test against the resolver directly. The `2026-08-21-pricing-engine` spec's Phase 2 fixes the root cause; until it lands, this test is the only guard |
| R2 | **The resolver is global.** Every price resolution in the application passes through it, including back-office and any future storefront | High | Gate on `ctx.customerId` **and** on the partner having terms; return `undefined`, never `null` (§3.4). Test that a context without `customerId` resolves identically with and without the module loaded |
| R3 | **A-20 (per-line status to the partner) is in tension with CC-2.** Line status leaks fulfilment detail that the source document keeps internal | Medium | Line status is a status only — never a reason, a component, or a stock figure. The `403 ordering_blocked` body and the non-broadcast of `stock.depleted` follow the same rule. If sales later judge this too revealing, it is a display change, not a data-model change |
| R4 | **A-18 (both prices shown) exposes the full discount structure.** A partner who sees list and net on every SKU knows Anter's margin ladder | Medium | Product-owner decision, adopted knowingly (D11). Reversible: hiding the list column is a UI change, and the API field can be dropped behind the same feature |
| R5 | **D6 (simple stock) has no locations, lots or movements.** There is no audit trail of why a quantity changed, and no multi-warehouse allocation | Medium | Accepted for this slice. The allocation ledger gives partial traceability. Migrating to `wms` later means backfilling balances and writing the order-assignment adapter that D6 avoids — a real, non-trivial future cost, recorded here so it is not a surprise |
| R6 | **D7 (no carrier integration) makes the split-cost comparison operator-entered.** The panel's purpose is to make splitting visibly costly; three typed numbers are weaker evidence than three rated ones | Medium | Accepted. Pre-fill the quoted figure from the order so only the two shipment costs are typed |
| R7 | **`anter_orders` table name matches the module id.** Harmless but easy to misread in queries and migrations | Low | Named deliberately, consistent with the repo's own `customers` / `customer_entities` shape |
| R8 | **Core `sales` stays installed** alongside a second order concept. Two "Orders" in one back office is an IA hazard | Low | Anter's orders live under their own navigation group; core `sales` order pages are not surfaced in this deployment's sidebar |
| R9 | **The soft-optional calculation fallback can drift from `sales`.** A deployment running without `sales` computes totals with simpler arithmetic, so the same order could total differently in two deployments | Medium | The fallback is intentionally naive and says so in its own log line at boot. A test asserts both paths agree on the single-tax-rate, no-adjustment case — the only case the fallback claims to handle. Residual risk: a multi-rate order without `sales` is wrong, and the fallback must refuse rather than guess |
| R10 | **`anter_stock_allocations` grows without bound**, and available quantity is an aggregate over it | Low | Partial index restricted to live statuses, plus a monthly archival worker (§Performance). Residual risk: none at Anter's expected volume |

### Blast radius

New app modules add no contract surface to `@open-mercato/*` packages — nothing in
`BACKWARD_COMPATIBILITY.md`'s thirteen protected categories changes. The single shared-state touch
is `registerCatalogPricingResolver` (R1, R2), which is additive and reversible by not registering.
No existing table is altered.

### Rollback

Disabling both modules in `src/modules.ts` removes the portal pages, the back-office pages and the
resolver registration; catalogue pricing returns to `selectBestPrice` exactly as before. Data
survives in its own tables. There is no partial state to unwind because nothing writes into another
module's tables.

---

## 📋 Phasing

Five phases, each independently shippable, in dependency order. Phase A is usable on its own
(partners can order; staff work the orders in the database). Every subsequent phase makes the
previous one less manual.

| Phase | Capability | Screens | Depends on |
|---|---|---|---|
| **A** | Portal ordering — catalogue, product card, cart, checkout | s33–s38, s42 | — |
| **B** | Back-office order handling — orders list, line-level fulfilment, stock allocation | s43, s44 | A |
| **C** | Release and partial shipment — queue, line/quantity selection, shipments | s40, s41 | B |
| **D** | Partner-facing tracking and documents — timeline, invoice, waybill | s39, s15 | C |
| **E** | CRM feedback — partner terms editing and partner-card figures | s16, s17 | A |

E depends only on A (it aggregates placed orders) and can run in parallel with B–D.

---

## 📋 Implementation Plan

Each step leaves the application working and is verifiable by a test. Steps map onto
`om-auto-create-pr`'s execution plan; the phase is the PR boundary.

### Phase A — Portal ordering

1. Scaffold `anter_portal` and `anter_orders` app modules (`index.ts`, `setup.ts`, `acl.ts`, `di.ts`, `events.ts`, `encryption.ts`, `i18n/`). Declare staff features and `defaultRoleFeatures`, portal features and `defaultCustomerRoleFeatures` (§3.10). Both enabled in `src/modules.ts`, both empty. `yarn generate` clean, then `yarn mercato configs cache structural --all-tenants`.
2. `anter_orders`: `AnterPartnerTerms` + `AnterPartnerGroupDiscount` entities, validators, migration, `data/extensions.ts` link to `customers.customer_entity`, `makeCrudRoute` admin API.
3. `anter_orders`: `anterPartnerTermsService` (DI) — resolve terms by `customerEntityId`, with a null-terms path.
4. `anter_orders`: `anterPartnerPricingService.resolvePartnerPrice` (§3.4) with unit tests over the three-step discount resolution.
5. `anter_orders`: register the gated catalog pricing resolver; integration test asserting a partner context gets the discount **through the public price API** and a non-partner context is unchanged (R1, R2).
6. `anter_orders`: `AnterStockItem` entity + admin CRUD; availability derived read (`available = on_hand − Σ allocated`, with no allocations yet).
7. `anter_portal`: `AnterCart` + `AnterCartLine` entities, encryption map for the address snapshot, migration.
8. `anter_portal`: catalogue read API (`GET /catalog`, `GET /catalog/[productId]`) returning list price, partner price, discount and availability; `quote_only` for items with no list price. Prices resolved with **`resolveCatalogPriceBatch`**, one batch per page; the test asserts the query count (§Performance), not only the body.
9. `anter_portal`: catalogue pages — list and tile views with the toggle and category filter (s35, s42), and the product card (s36).
10. `anter_portal`: cart API — add / update / remove, re-pricing on quantity change, out-of-stock rejection (D13).
11. `anter_portal`: cart page (s37) with the delivery-mode picker and the summary panel via `salesCalculationService` (§3.5).
12. `anter_orders`: `AnterOrder` + `AnterOrderLine` entities, migration, `anter_orders.order.place` command with undo, `anter_orders.order.placed` event.
13. `anter_portal`: cart header endpoint (delivery mode, notes, optional partner reference) and checkout endpoint (§3.3) — re-pricing, `409` price-change body, `403` blocked-account body, reference frozen onto the order (§3.11).
14. `anter_portal`: order confirmation page (s38) and order list (s15, without the invoice column, which arrives in D).
15. `anter_portal` / `anter_orders`: DI-resolved cache for partner terms and the catalogue page layer, with tenant/org tags and the documented invalidations (§Performance).
16. Module-absent tests: `sales` disabled → fallback calculation, module boots, order places; `attachments` disabled → document columns render "—".
17. Integration tests for Phase A (§Test coverage).

### Phase B — Back-office order handling

18. `anter_orders`: `AnterStockAllocation` entity, migration, `anter_orders.stock.allocate` command with undo; placement allocates best-effort.
19. `anter_orders`: back-office orders list (s43) with KPIs, partner filter, source column, partner-reference column and free-text search across order number and partner reference (§3.11).
20. `anter_orders`: order detail page with lines, allocations and status.
21. `anter_orders`: fulfilment line view (s44) with the fulfilment-mode column and filter tabs.
22. `anter_orders`: `anter_orders.order.confirm` command and its back-office action.
23. Integration tests for Phase B.

### Phase C — Release and partial shipment

24. `anter_orders`: `AnterShipment` + `AnterShipmentLine` entities, migration.
25. `anter_orders`: release evaluation — auto-release on all-packed, queue entry on partially packed (§3.7); status transitions and events.
26. `anter_orders`: release queue page (s40) with the three row treatments.
27. `anter_orders`: `anter_orders.shipment.create` command with undo — line and quantity selection, partial-quantity split, status recomputation.
28. `anter_orders`: partial-shipment page (s41) with the split-cost panel and the "what the partner will see" panel.
29. `anter_orders`: `anter_orders.shipment.dispatch` command, shipment list page, `shipped_partially` / `shipped` events.
30. Integration tests for Phase C.

### Phase D — Partner-facing tracking and documents

31. `anter_orders`: `AnterInvoice` entity, migration, `anter_orders.invoice.record` command with the attachment (D8).
32. `anter_portal`: order detail page (s39) — seven-step timeline, per-line status, shipments with tracking and waybills, documents.
33. `anter_portal`: invoice column on the order list, present only when an invoice exists.
34. `anter_portal`: `POST /cart/reorder` and the "Ponów" actions on list and detail.
35. `anter_portal`: portal SSE subscription so a status change lands without a reload.
36. Integration tests for Phase D.

### Phase E — CRM feedback

37. `anter_orders`: CRM subscribers for `order.placed` / `.shipped` / `.delivered` writing activities through the `customers` public API (persistent subscribers).
38. `anter_orders`: `anterPartnerStatsService` — last order, rolling turnover, order count, computed on read.
39. `anter_orders`: partner-card widget injected at `crud-form:customers.company` (s16).
40. `anter_orders`: partner-terms editing on the CRM company page (s17), including the blocked flag.
41. Integration tests for Phase E.

---

## 🧪 Test coverage

Required in the same change as the code, per `.ai/qa/AGENTS.md`. Tests are self-contained: they
create their own partner, catalogue item, price and stock in setup and remove them in teardown;
none depends on seeded demo data.

**API paths**

| Path | Assertions |
|---|---|
| `GET /api/anter_portal/catalog` | partner price applied; list price present; `quote_only` item carries no prices; another partner's discount never leaks |
| `GET /api/anter_portal/catalog/[productId]` | per-variant price and availability |
| `POST /api/anter_portal/cart/lines` | rejects `quote_only`; rejects over-available quantity; prices the line |
| `PUT /api/anter_portal/cart/lines/[id]` | re-prices on quantity change |
| `POST /api/anter_portal/cart/reorder` | copies lines at current prices; places nothing |
| `PUT /api/anter_portal/cart` | sets delivery mode, notes and `partnerReference`; a blank reference stores null, not an empty string |
| `POST /api/anter_portal/checkout` | happy path; **places successfully both with and without a partner reference**; reference frozen onto the order and not editable afterwards; over-64-character reference rejected by zod; `409` on price change with per-line diff; `403` on blocked partner with **no reason in the body**; concurrent double-checkout yields one order |
| `GET /api/anter_portal/orders[/id]` | scoped to the caller's partner; another partner's id returns `404` |
| `anter_orders` CRUD | tenant/organization scoping on every list and detail |
| Commands | each undo restores the prior state, asserted field by field |

**UI paths** (Playwright, headless)

catalogue list ↔ tile toggle and category filter · add to cart from card and from list · cart
quantity edit and recompute · checkout to confirmation · order detail timeline and per-line status ·
back-office orders list filters and search by partner reference · order detail rendering with and
without a reference · fulfilment view tabs · release queue row treatments · partial
shipment selection with quantity split · partner-card widget on the CRM company page.

**Cross-cutting**

- Pricing resolver reached through the public API in a partner context (R1) and bypassed in a
  non-partner context (R2)
- Cart and order totals agree for identical lines (D5's whole justification)
- Address snapshots are encrypted at rest and decrypted only through `findWithDecryption`

---

## 🔀 Deviations from the prototype

Recorded so the prototype and this spec do not drift silently. Each needs a prototype revision if
it is to stand.

1. **The partner reference is optional**, where the prototype implied it was always present (D12,
   adopting A-19 in a weakened form). s37's field is labelled optional; s38's line "Twój numer
   ST/2026/09/114 znajdzie się na wszystkich dokumentach" and s39's subtitle render **only when one
   was supplied**. The prototype's screens show a partner who filled it in, so they stay accurate
   for that case — what they do not illustrate is the empty case.
2. **Release is keyed on the order, not the production order** (§3.7). s40's queue lists `ZLC-…`
   rows; for a catalogue-only order there is no `ZLC`. The screen's structure survives; its key
   column changes.
3. **"Oczekuje na komponent" becomes "oczekuje na towar"** on s41 and s39, because in this flow the
   blocker is stock, not a component.
4. **No dedicated blocked-account or empty-cart screen** (D13). A-4 is implemented as behaviour —
   a disabled submit and a short notice — rather than as the screen the prototype's README wanted.
5. **Core `sales` supplies the arithmetic** (D5). The prototype was silent on this, being static
   HTML; it is recorded here because "sales is custom" could otherwise be read as excluding it.

---

## 📓 Changelog

### Review — 2026-09-19
- **Reviewer**: Agent (self-review). The checklist asks for §1 scope-cohesion to run in a fresh-context subagent; this session is configured not to spawn subagents, so it was applied in-context. Treat that one verdict as weaker evidence than the rest.
- **Scope cohesion**: Bundle confirmed and **accepted by decision** — five independently deployable capabilities, kept in one spec at the maintainer's instruction, expressed as five phases (§Phasing) rather than five specs. Each phase is separately shippable.
- **Security**: Passed. Staff and portal features declared (§3.10); per-method `metadata` guards; tenant + organization + `customerEntityId` scoping stated as an absolute rule; blocked-account and `stock.depleted` bodies deliberately reason-free (CC-2); address snapshots routed through encryption maps and `findWithDecryption`.
- **Performance**: Passed after revision. The catalogue N+1 was the material finding — resolved with `resolveCatalogPriceBatch` and an asserted query count. Indexes enumerated per access pattern; keyset pagination on the growing lists; `pageSize` capped at 100.
- **Cache**: Passed after revision. DI-resolved cache, tenant/org tags, per-key TTL and invalidation. Prices and stock are explicitly never cached — CC-3 requires an immediate effect, and a stale quantity is an oversell.
- **Commands**: Passed. Every mutation is a command with a stated undo; irreversible effects (confirmation e-mail, CRM activity) compensate rather than erase; custom write routes run the mutation guard registry; optimistic locking on orders and carts.
- **Risks**: Passed. Ten risks with mitigations; R1 (module-local resolver registry) is the one Critical and its mitigation is a test through the public API, not a unit test.
- **Gaps found and fixed in this pass**: missing ACL/feature declaration; missing performance, index and cache section; no module-absent behaviour for the `sales` and `attachments` peers; `useGuardedMutation` and the mutation guard registry unstated; irreversible side effects unstated; `pageSize` cap unstated; status colours named by role rather than by token.
- **Verdict**: Approved for implementation.

### Revision — 2026-09-19 (A-19 reinstated, optional)
The review's one open caveat is closed. **D12 now adopts A-19 as an optional field**: the
distributor may supply their own reference number at checkout, and the order places identically
whether they do or not. Added: §3.11 (the field's rules), `partner_reference` on `anter_carts` and
`anter_orders`, `PUT /api/anter_portal/cart`, a partial index behind the back-office search, the
column and search on s43, conditional rendering on s37/s38/s39, two edge cases, and test coverage
for both the supplied and the absent path. The field is deliberately **not** encrypted and **not**
unique — §Sensitive data states why, since the review checklist lists document numbers among
encryption candidates.

Also corrected in this pass: the Deviations list had been misnumbered 3–7 by an earlier renumbering
of the implementation steps.
