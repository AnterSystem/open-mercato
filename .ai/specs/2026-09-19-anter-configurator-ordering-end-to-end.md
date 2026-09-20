# Anter — Configurator Ordering, End to End

| Field | Value |
|-------|-------|
| **Status** | Specification |
| **Created** | 2026-09-19 |
| **Companion spec** | [`2026-09-19-anter-catalogue-ordering-end-to-end.md`](./2026-09-19-anter-catalogue-ordering-end-to-end.md) — **read first.** This spec builds on it and deliberately restates none of it |
| **Source prototype** | [`.ai/prototypes/anter-system-etapy`](../prototypes/anter-system-etapy/README.md) (revision 2) |
| **Source requirements** | [`docs/anter-system-architektura-docelowa.md`](../../docs/anter-system-architektura-docelowa.md) §Konfigurator, §Platforma B2B · [`story-map.md`](../prototypes/anter-system-etapy/story-map.md) |
| **Prototype screens** | s13, s14, s45 (portal) · s9, s10, s11, s12, s46 (back office) · s25–s32 read as current-state evidence, not as design |
| **Story-map coverage** | US-2.1, US-2.2, US-2.3, US-2.4, US-3.1, US-3.2, US-4.6 · CC-1, CC-3, CC-4, CC-5, CC-6 |
| **Modules reused** | `anter_portal`, `anter_orders` (hard, from the catalogue spec) · `catalog`, `customers`, `customer_accounts`, `portal` (hard) · `attachments`, `sales` (soft-optional, via the catalogue spec's contracts) |
| **Modules new** | `apps/mercato/src/modules/anter_configurator` |
| **Language** | English, per `.ai/specs/` convention. Polish labels quoted where they are the decided user-facing wording. |

---

## 📝 TLDR

The second of Anter's two ordering paths, specified end to end: a partner uploads the floor plan of
their own building, draws safety barriers, gates, bollards and column guards onto it, and the
quantities, the bill of materials and the price fall out of the geometry — nobody types a quantity.
What happens next depends on whether that partner has prices.

**Priced account** (s13): the configuration goes into the cart the catalogue spec already built,
becomes an order, and a constructor technically reviews it before it is confirmed.
**No-price account** (s14, s45): the same drawing produces a specification without a single price;
it goes to Anter as a quote request, a constructor reviews it, the back office values it, an offer
is issued, and the partner turns that offer into an order.
**Anter staff** (s9, s11, s12) use the same engine with cost and margin visible, for investment
opportunities the configurator was not self-service for.

One engine, three modes, differing only in which prices are visible and which products are
available — that is the source document's own framing and the prototype's, and this spec implements
it literally: mode is derived from the caller, never passed in.

The load-bearing engineering fact: **the drawing canvas and the geometry→BOM engine do not exist in
this repository and have no primitive to build on.** They are the schedule. Everything else here is
ordinary module work that leans on contracts the catalogue spec already fixed.

The load-bearing correctness rule: **the browser's bill of materials is advisory; the server's is
authoritative.** A quantity that becomes a price must be recomputed server-side from stored geometry
before it reaches an order.

---

## 🔗 Relationship to the catalogue spec

The catalogue spec owns the commercial machinery. This spec owns the drawing, the approval loop and
the offer, and **calls** that machinery rather than re-specifying it. If a capability appears in the
table below as *reused*, its data model, API shape, guards and tests live in the catalogue spec and
are not restated here.

| Capability | Owner | This spec's relation |
|---|---|---|
| Portal identity, portal RBAC, portal shell | catalogue spec §3.10 (via `customer_accounts` / `portal`) | Reused unchanged. Adds two portal features (§3.14) |
| Partner terms, discount rate, blocked flag | catalogue spec `anter_partner_terms` | Reused. **Extended** by two additive columns and one child table (§3.16) |
| Partner price resolution, `anterPartnerPricingService`, the gated catalog resolver | catalogue spec §3.4 | Reused verbatim. The configurator resolves BOM-line prices through it in batch; it registers **no second resolver** |
| Document totals (`salesCalculationService`, the soft-optional fallback) | catalogue spec §3.5, D5 | Reused for offer totals as well as order totals. §3.11 states the equality requirement |
| Cart, cart lines, quantity edit, delivery mode, checkout, the `409` price-change body | catalogue spec `anter_portal` | Reused. The configurator adds lines to the existing cart; it does not own a second cart |
| Order aggregate, order lines, statuses, stock, allocation, release, partial shipment, shipments, invoices | catalogue spec `anter_orders` | Reused. **Extended** by four additive columns and one new placement source (§3.16) |
| Catalogue browse, product card, tile view, category filter | catalogue spec `anter_portal` pages | Reused. **Extended** by the no-price rendering (s45) — §3.16 |
| CRM company activities, partner-card figures | catalogue spec §3.8 | Reused. This spec emits additional events into the same subscriber pattern (§3.12) |
| Production orders, component shortages, purchasing | neither spec | Out of scope in both. §Scope states the seam a `production` line leaves behind |

**The rule this table encodes:** where a behaviour already has an owner, this spec names the owner
and the call, and stops. Where it changes something the other spec owns, it says so explicitly in
§3.16 with the migration — never by quietly redefining it.

---

## 📐 Decisions (fixed — not re-litigated below)

Numbered `C*` so they never collide with the catalogue spec's `D1`–`D13`, which remain in force.

| # | Decision | Consequence |
|---|---|---|
| C1 | The configurator is **built natively** in Open Mercato. The existing Anter Site Configurator (separate Vite/React repo, screens s25–s32) is read as **evidence of required behaviour**, not integrated or ported | §3.4–§3.6 specify the geometry model and BOM engine as new work; §Risks R1 records what that costs |
| C2 | **One module, `anter_configurator`**, split by domain rather than by surface — it contributes both portal pages and back-office pages | §3.1 justifies the departure from the catalogue spec's surface split |
| C3 | **Mode is derived from the caller, never requested.** Internal / partner / partner-without-prices / no-access are four resolutions of one authorization question | §3.7. There is no `?mode=` parameter anywhere in the API |
| C4 | **The server's BOM is authoritative.** The browser computes the same numbers for responsiveness; any number that reaches an offer, a cart or an order is recomputed server-side from stored geometry | §3.5, §Test coverage. A client-supplied quantity is never persisted as a priced quantity |
| C5 | Element geometry is stored in **plan units**; metric lengths derive from the revision's calibration. Recalibrating a revision that has been submitted is **forbidden** — it forces a new revision | §3.4. Prevents a silent BOM change under an accepted document |
| C6 | **Rule and exclusion authoring stays out of scope** (stage 1, s6). What the catalogue cannot express falls out to a constructor-priced custom item (CC-5) | §3.6. The alternative — a second rule store — would break CC-3 |
| C7 | The **offer is a custom aggregate** in `anter_configurator`, not a core `sales` quote | §"Why not core `sales` quotes" |
| C8 | The **submission workflow is a custom status machine**, not a `workflows` module definition | §"Why not the `workflows` module" |
| C9 | **Technical revision gates order confirmation, not order placement.** A priced configuration becomes a `placed` order immediately; the constructor's acceptance is what allows `confirmed` | §3.9. Matches s13's own wording and s46's `KNF-2026-0412` row |
| C10 | A **new revision invalidates** the technical acceptance bound to the old one and supersedes any offer issued on it | §3.8, lifted from the working application (s29, s30) |
| C11 | Product geometry metadata (drawing kind, module length, post, anchors per post, impact energy) lives on the **catalogue product record** as custom fields, not in a configurator-private library | §3.3. This is the source document's open question answered in the direction CC-3 demands |
| C12 | Plan points (s13's coverage card) are **declared, not detected**. No image or CAD analysis | §3.15, §Deviations 1 |
| C13 | Prototype assumptions **adopted**: A-29 (two approval tracks, technique before money), A-9 (a role without margin access), A-5 (abandoned-configuration signal, thresholds configurable) | §3.9, §3.7, §3.12 |
| C14 | Prototype assumption **extended**: A-21's boundary between catalogue and configurator becomes two distinct machine states — `quote_only` (no list price exists) and `outside_price_list` (a price exists, this partner's contract does not cover it) | §3.16, §Deviations 3 |

---

## 📝 Problem Statement

Anter sells safety systems that are installed *into a building*: barriers along an aisle, guards
around columns, gates cut into a run. How many metres and how many posts you need is a property of
the building, not of a product form. Today the path from "here is my warehouse" to "here is a price"
runs through a site visit, a hand-drawn sketch, a mail, and a person counting off a drawing.

Three failures follow from that, none of which the catalogue path can fix — the catalogue path
exists precisely for the orders that *do not* need a drawing:

1. **Quantities are counted by hand, twice.** The person quoting counts from a sketch; the person
   producing counts again from the quote. The prototype's own example — a 42 m walkway realised as
   41.4 m of 1.8 m modules with 24 posts, and 112 anchors across the whole drawing — is exactly the
   arithmetic that gets done manually and gets done wrong.
2. **The specification and the price are separate documents.** A mail describes the solution; a
   spreadsheet prices it; neither references product indexes, so nothing survives into production
   without being retyped (CC-1 is violated at its most expensive point).
3. **Nobody confirms the solution can be installed where it is drawn** before it is priced and
   promised. Floor thickness, a collision with an installation, service access — the configurator
   computes quantities from geometry but cannot rule on any of those, and today there is no step
   where someone does.

A working application already solves a large part of (1): drawing on a plan with automatic material
take-off including posts and anchors. It also already has document revisions, a "checked by" field,
a technical acceptance loop and a hard block against ordering on a superseded drawing. What it does
not have is a product base with prices — prices are typed in by hand — and it lives outside the
commercial system. This spec keeps the behaviours that application proved are needed and puts them
where the catalogue, the partner's contract and the order already live.

### Why not core `sales` quotes

C7 makes the offer custom, and that owes a justification rather than an assertion — core `sales` has
quotes, a quote→order conversion, and even a public-facing quote acceptance page
(`sales/frontend/quote/`), which is very close to what s11 and the working application's partner
panel do.

| Anter need | Core `sales` quotes today | Verdict |
|---|---|---|
| An offer binds to **one configurator revision** and is superseded when a newer one lands (C10) | No such concept; a quote references products and prices | **Real gap.** The binding is the point — without it the working application's most valuable safety rule disappears |
| An offer may be **deliberately incomplete** — one line awaiting a constructor's price, excluded from the total, the document flagged (s11) | Lines require a price; totals are complete by construction | **Real gap.** A "price unknown" line is not a zero-price line |
| Offer number `OF-YYYY-NNNN` assigned once and carried onto order and production order (CC-4) | Document numbering exists and is configurable | **Configuration**, not architecture |
| Quote → Order conversion | Exists, and is mandated | **Would fit** — except the order it converts into is `SalesOrder`, and the companion spec already chose `AnterOrder` (its D2) |
| Channel scoping on every document | Mandated | **Real friction**, same as the companion spec found |

Two genuine gaps plus the fact that the target order aggregate is already custom. The honest reading
is the same as the companion spec's: core `sales` could be bent to this shape, and the cost of
bending it is a permanent custom-field surface plus a synthetic channel. C7 accepts the cost of
owning an offer aggregate instead — **and keeps `salesCalculationService` for its arithmetic**, so
an offer and the order it becomes cannot disagree about tax or rounding (§3.11).

### Why not the `workflows` module

C8 makes the submission loop a custom status machine. The `workflows` module is present, capable and
designed for exactly this shape — definitions, instances, user tasks, event triggers. Why not:

- The loop has **two fixed tracks and five states** (§3.9), decided by the product owner and drawn in
  s46. It is not configurable per tenant, and modelling a fixed machine as a configurable one
  invites someone to reconfigure it into an invalid shape.
- The transitions have **commercial preconditions** that live in this module's data — is the bound
  revision still current, does a custom item still lack a price, has an order already been placed.
  Expressing those as workflow activity conditions moves the domain rule into a definition document.
- The states must be **queryable as a list with SLA counters** (s46's "czeka 2 dni", "po terminie",
  the four KPI tiles). A status column with an index answers that; workflow instances need a
  projection built for it.

What this decision forfeits is real and worth stating: no free audit trail, no free retries, no free
task inbox. §3.9 therefore specifies the state machine, its audit table and its notifications
explicitly rather than inheriting them. If Anter later wants configurable approval chains — a second
approver above a value threshold, say — that is the moment to migrate, and the state machine is
small enough to migrate.

---

## 🔬 Prior art

Checked against configure-price-quote and space-planning tools that solve this shape: Tacton CPQ,
Configit, DriveWorks, Combeenation, Autodesk/SketchUp layout plugins for safety barriers, and the
barrier vendors' own online planners (A-Safe, Boplan). Written from working knowledge rather than a
fresh feature audit — treat specifics as directional.

**What they get right that this spec adopts:**

- **Geometry is the input, the BOM is the output.** Every credible tool in this category draws on a
  plan and derives quantities; none asks for a length in a form field. §3.5 follows.
- **Module-fit arithmetic is explicit and visible.** Barrier systems come in fixed module lengths, so
  a 42 m aisle is never 42 m of product. The good tools show the realised length and the residual
  gap rather than silently rounding. §3.5's `module_fit_policy` and the residual display follow.
- **Derived components are marked as derived.** Posts and anchors appear in the BOM but are not
  separately drawn, and every tool distinguishes them so the user does not delete one by accident.
  §3.5's `origin` field follows, as does US-2.1's own acceptance criterion.
- **Document revisions gate ordering.** DriveWorks and the engineering-led tools refuse to quote from
  a superseded model. C10 follows, and the working application already proved it at Anter.

**What they carry that this spec deliberately skips:**

- **Full constraint solvers** (Tacton's and Configit's core competence — a rule engine that finds
  valid configurations). C6 skips rule authoring entirely for now; the CC-5 fallout is the escape
  hatch. Revisit when stage 1 delivers the rule layer.
- **3D visualisation and walk-throughs.** The working application has a 2D+3D toggle; this spec
  ships 2D only. 3D is a rendering feature with no effect on quantities or price.
- **CAD import (DWG/DXF) with layer recognition.** Underlays are raster or PDF images here (§3.15),
  and plan points are declared (C12). CAD parsing is a project of its own.
- **Automated clash detection.** The whole point of §3.9's technical revision is that a person rules
  on installability. Automating it is not on the table.

---

## 📝 Scope

### In scope

1. Product geometry metadata on catalogue records: drawing kind, module length, post index, anchors per post, mounting conditions, impact energy, unit cost (s5's missing layers, only the ones the configurator needs) — §3.3
2. Projects, revisions and drawn elements over an uploaded plan underlay, with scale calibration, grid snapping and angle constraint (s13, s14, s9, s26) — §3.4
3. Server-authoritative geometry→BOM derivation including modules, posts, anchors and gate inserts (s13's "zestawienie", s26's "automatyczne zestawienie") — §3.5
4. Declared plan points and coverage reporting (s13's "Punkty wykryte z planu") — §3.15
5. The three configurator modes and the viewer account's refusal, plus the margin sub-permission (s9, s12, s13, s14) — §3.7
6. Non-standard items falling out to constructor pricing, and the incomplete-valuation flag they create (s10, s11) — §3.6
7. Priced track: configuration → existing cart → order, with technical revision gating confirmation (s13, s46) — §3.9
8. No-price track: configuration → quote request → technical revision → back-office valuation → offer → partner accepts → order (s14, s46, s11) — §3.9, §3.10
9. The submissions queue with both tracks, SLA counters, assignment, element-anchored comments and the three constructor decisions (s46, behaviour proven by s29) — §3.9
10. Offer aggregate, `OF-YYYY-NNNN` numbering, validity, incompleteness, supersession (s11, s30) — §3.10
11. The no-price catalogue rendering and the account-type switch that produces it (s45, s17's "Typ konta i widoczność cen") — §3.16
12. Internal mode outputs: cost, margin at list, margin after discount, handoff to a CRM deal (s9, s11) — §3.7, §3.12
13. Quote requests and abandoned projects as CRM signals (CC-6, US-3.5, A-5) — §3.12

### Out of scope

- **Everything the catalogue spec owns** (§Relationship). Cart mechanics, checkout, stock, allocation, release, partial shipment, shipments, invoices, partner-card statistics and the pricing resolver are called, not rebuilt
- **Production orders, component shortages, purchasing demand** (s18–s20, stage 4). A configurator order will legitimately contain lines that must be manufactured; §3.16 specifies exactly what the release queue does with such a line in the interim, and that is the whole of this spec's production story
- **Rule and exclusion authoring** (s6, stage 1) — C6
- **Lead qualification and opportunity management** (s1–s3, stage 0). This spec writes to a `customer_deal` by id; it does not manage deals
- **Product-base authoring beyond the geometry fields it consumes** (s4–s8, stage 1). §3.3 adds fields to an existing product form; it does not build the product form
- **3D, CAD import, clash detection, constraint solving** (§Prior art)
- **The training module** (s24, stage 6) and **transport rating** (s22, stage 5)
- **Migrating existing Anter Site Configurator projects.** C1 rebuilds; historical project migration is a separate exercise with its own data audit

---

## 📝 Architecture

### 3.1 Module placement — and why the surface split does not hold here

The catalogue spec split its two modules by **surface**: `anter_portal` for what the distributor
touches, `anter_orders` for what staff touch. That split works there because the two sides genuinely
do different things to different data.

It does not work here. The configurator is explicitly *one engine in two permission modes* — that is
the source document's sentence, the prototype's central claim about screens 9 and 13, and the reason
s9 and s13 are drawn as the same screen. Splitting it by surface would duplicate the geometry model,
the BOM engine and the revision rules across two modules, and the first divergence between the
copies would be a partner and a salesperson looking at the same project and seeing different
quantities.

```
apps/mercato/src/modules/
  anter_configurator/   one engine, two surfaces.
                        Owns: AnterProject, AnterProjectRevision, AnterProjectElement,
                              AnterBomLine, AnterCustomItem, AnterPlanPoint,
                              AnterSubmission, AnterSubmissionComment, AnterSubmissionEvent,
                              AnterOffer, AnterOfferLine.
                        frontend/[orgSlug]/portal/...  (customer auth)  → s13, s14
                        backend/anter_configurator/... (staff auth)     → s9, s10, s11, s12, s46
```

The cost of C2 is that one module's `metadata` guards come in two flavours (`requireCustomerAuth`
and `requireAuth`) and a reviewer must check which surface a route belongs to. That is a review
discipline, and `warranty_claims` already carries both surfaces in one module, so it is a pattern the
repository has rather than one this spec invents.

### 3.2 Dependency direction

```
anter_configurator ──reads──▶ catalog            (products, variants, categories, geometry fields, prices)
anter_configurator ──uses───▶ anter_orders       (anterPartnerPricingService, anterPartnerTermsService,
                                                  command anter_orders.order.place)
anter_configurator ──uses───▶ anter_portal       (command anter_portal.cart.add_lines)
anter_configurator ──reads──▶ customer_accounts  (customer auth context)
anter_configurator ──reads──▶ customers          (company, deal) and writes activities via its public API
anter_configurator ──uses───▶ attachments        (plan underlay, offer PDF, revision drawing export)
anter_configurator ──uses───▶ sales              (salesCalculationService, through the companion
                                                  spec's soft-optional contract — never resolved directly)
anter_configurator ──emits──▶ event bus          (CRM feedback, portal SSE, back-office SSE)
```

Nothing points back: neither `anter_orders` nor `anter_portal` imports from `anter_configurator`.
Where an order needs to know it came from a configuration, it stores a uuid (§3.16) and resolves it
through a DI service that returns `null` when this module is absent. That keeps the companion spec's
two modules deployable without this one — which matters, because the catalogue path is the one that
ships first.

**The one exception, stated plainly.** `anter_orders.order.confirm` must refuse to confirm a
configurator-sourced order whose technical revision has not been accepted (C9). Putting that check
inside `anter_orders` would invert the dependency. It is therefore implemented as a **mutation guard
registered by `anter_configurator`** against the confirm command — the platform's own mechanism for
a module constraining another module's write, and the reason the companion spec insists every custom
write route runs the guard registry. With this module absent, no guard is registered and confirm
behaves exactly as the companion spec specifies.

### 3.3 Product geometry layer (C11, CC-1, CC-3)

The prototype's most consequential finding is that the working configurator's own product library
holds drawing kind, module length, post, anchor and anchors-per-post — and holds no price, no
weight, no discount group. The product base holds the commercial layers and holds no geometry. The
same product is described twice, in two systems, neither complete.

C11 resolves it in the direction CC-3 requires: **one place of edit.** The geometry layer is added to
the catalogue product record as custom fields, declared in `anter_configurator/ce.ts`:

```ts
defineFields(entityId('catalog', 'catalog_product'), [
  cf.select('anter_drawing_kind', ['line', 'point', 'insert', 'none'], { default: 'none' }),
  cf.float('anter_module_length_m'),          // line products: length of one module
  cf.select('anter_module_fit_policy', ['round_down', 'round_up', 'nearest'], { default: 'round_down' }),
  cf.text('anter_post_sku'),                  // catalogue SKU of the post consumed per joint
  cf.integer('anter_posts_per_run_extra', { default: 1 }),
  cf.text('anter_anchor_sku'),
  cf.integer('anter_anchors_per_post', { default: 4 }),
  cf.float('anter_insert_clear_width_m'),     // insert products: the gap they occupy in a host run
  cf.float('anter_impact_energy_kj'),
  cf.text('anter_mounting_conditions'),
  cf.currency('anter_unit_cost_net'),         // internal mode only — §3.7
], 'anter_configurator')
```

Four consequences worth naming:

1. **A product with `anter_drawing_kind = 'none'` cannot be drawn.** It stays orderable from the
   catalogue; it simply does not appear in the configurator's product panel. That is how the two
   paths stay separable without a second catalogue.
2. **`anter_unit_cost_net` is a cost figure on a shared record.** It is read only under
   `anter_configurator.margin.view` (§3.7) and is never serialised into any portal response — the
   portal catalogue API (owned by the companion spec) already projects an explicit field list, and
   this field is not added to it. §Risks R6.
3. **Custom-field values are indexed** through the standard mechanism, so filtering the product panel
   by drawing kind does not table-scan.
4. **Stage 1 is the migration target, not a competitor.** When the product base gains a first-class
   geometry section, these fields are the thing it absorbs. Declaring them here as custom fields
   rather than as a private table is what makes that absorption a data migration instead of a
   rewrite.

### 3.4 The drawing model

Three levels, because they change at three different rates and only the middle one is a document.

```
AnterProject        the building and the commercial context. Long-lived.
  └─ AnterProjectRevision   a version of the drawing. Immutable once submitted. Numbered A, B, C…
       ├─ AnterProjectElement   one drawn thing: a run, a placed point, an insert
       ├─ AnterPlanPoint        a declared point of interest and its coverage state
       ├─ AnterBomLine          derived, frozen on the revision at compute time
       └─ AnterCustomItem       a position the catalogue cannot express (CC-5)
```

**Coordinate system (C5).** Element geometry is stored in **plan units** — the underlay image's own
coordinate space, origin top-left, y downward, floating point. The revision carries
`metres_per_unit`, obtained by two-point calibration: the user clicks two points on the underlay and
types the real distance between them. Metric length is always derived:
`lengthM = lengthInUnits × metresPerUnit`.

This is the right storage because a recalibration then costs nothing — no geometry rewrite, no
rounding accumulation. It is also the reason C5 forbids recalibrating a submitted revision: the same
property that makes recalibration cheap makes it able to change every quantity under an accepted
document without touching a single element. Attempting it returns
`409 { error: 'revision_locked', reason: 'calibrated_after_submission' }` and offers to branch a new
revision.

**Elements.** One row per drawn thing:

| Kind | Geometry | Produces |
|---|---|---|
| `run` | polyline: an ordered array of `[x, y]` vertices, ≥ 2 | Length; modules, posts, anchors (§3.5) |
| `point` | a single `[x, y]` plus an optional rotation | One unit; its own posts and anchors |
| `insert` | a `[x, y]` position plus the `run` element id it is placed on and the parametric offset along it | One unit; splits the host run; consumes `anter_insert_clear_width_m` |
| `annotation` | polyline or point, no product | Nothing. Carries a label only — zones, aisles, the s13 plan legend |

**Drawing aids** (client-side only; the server validates results, not gestures): grid snap with a
per-revision `grid_size_m` defaulting to `0.5`, vertex snap to existing endpoints within a pixel
tolerance, and a 0/45/90° angle constraint toggle. The server's validation is deliberately narrow —
coordinates finite and inside the underlay bounds, a run of at least two distinct vertices, a run
length not shorter than one module of its product, an insert whose host run exists and is long
enough to contain its clear width. Everything else is the drawer's judgement.

**Revisions.** A revision is `draft` while it is being edited and becomes immutable when submitted
(§3.9). Editing a submitted revision means creating the next one, which copies elements, points and
calibration forward and increments the letter. The revision carries `change_description` — the
working application's "Opis rewizji", and the only field a reviewer has to understand why the drawing
moved.

### 3.5 Geometry → bill of materials

The heart of the feature, and the part that must be identical in two implementations (browser and
server) — which is why it is specified as arithmetic, not as behaviour, and why C4 makes one of the
two authoritative.

**Step 1 — split runs at inserts.** Each `insert` on a run divides it into segments and consumes
`anter_insert_clear_width_m` of its host's length at the insertion point. A run with two gates becomes
three segments; the gate's own clear width belongs to the gate, not to the barrier.

**Step 2 — fit modules to each segment.** For a segment of length `L` and a product of module length
`M`:

```
rawCount   = L / M
moduleCount = policy === 'round_down' ? floor(rawCount)
            : policy === 'round_up'   ? ceil(rawCount)
            :                           round(rawCount)
realisedLength = moduleCount × M
residual       = L − realisedLength      // signed; negative under round_up
```

`round_down` is the default because over-delivering length is a fabrication problem and
under-delivering is a visible, discussable gap. **The residual is shown**, per segment and summed per
element, in the element panel and in the BOM footer — the prototype's 42.0 m walkway realised as
41.4 m is this number made visible rather than hidden. A `moduleCount` of zero is a validation error
at draw time, not a silent empty segment.

**Step 3 — derive posts.** Per contiguous segment: `postCount = moduleCount + anter_posts_per_run_extra`
(default `1`, giving the familiar *n+1* for an open run). A closed loop — first vertex equal to last —
uses `moduleCount`. Posts at a shared vertex between two segments of the **same** product are counted
once; posts between different products are counted per product, because they are different posts.

**Step 4 — derive anchors.** `anchorCount = postCount × anter_anchors_per_post`, summed across every
product that contributes posts.

**Step 5 — point and insert products.** Quantity is the placed count. Each contributes its own posts
and anchors from the same fields, which is how s26's gate arrives "ze słupkami".

**Step 6 — emit BOM lines.** One line per (product, variant, origin):

| `origin` | Meaning | Deletable by the user |
|---|---|---|
| `drawn` | Corresponds to elements on the plan | No — delete the element instead |
| `derived` | Posts, anchors and required accessories the rules pulled in | No. Marked as chosen, not selected (US-2.1) |
| `manual` | Added to the BOM without being drawn — a spare, a service item | Yes |

**Step 7 — price.** Every line resolves through the companion spec's `anterPartnerPricingService` in
**one batch per revision**, exactly as that spec requires of catalogue pages. Lines whose product has
no resolvable price for this partner do not become zero — they become `to_quote` (§3.6).

**Determinism (C4).** The BOM is a pure function of `(elements, plan points, product geometry fields,
calibration, fit policy)`. It is computed in the browser on every geometry change for responsiveness
and recomputed on the server on save, on submission, on adding to cart and on offer issue. The two
implementations share fixture-driven tests asserting identical output to four decimal places
(§Test coverage). Where they disagree, the server wins and the client refreshes — silently, because
a user who sees a number change without acting will not trust either number.

**Frozen snapshots.** BOM lines are persisted per revision with the product name, SKU, unit and the
geometry inputs used. A later catalogue edit to a module length must not rewrite history — the same
rule the companion spec applies to order lines.

### 3.6 Non-standard items (CC-5)

C6 keeps rule authoring out. What remains in is the escape hatch the source document demands: a
position the configurator cannot express must **not block the tool**.

Two distinct machine states, deliberately separated because they have different remedies:

| State | Cause | Remedy | Where it shows |
|---|---|---|---|
| `to_quote` | A product exists and is drawable, but no price resolves for this caller — either no list price at all, or a category outside this partner's price-list scope (C14) | Back-office valuation (§3.9 track 2) | s9's element 5, drawn dashed; s45's sliding-gate row |
| `custom_item` | The requirement has no catalogue product — s10's curved barrier, radius 14 m, no such attribute exists | A constructor prices it by hand | s10's dialog, s11's "do wyceny" section |

A `custom_item` is not an element: it has no geometry and cannot be drawn. It is a described position
on the revision, carrying the constructor-facing description, the quantity, the unit and a nominated
constructor. Its consequences are fixed:

- It **does not enter the automatic total.** The revision total and the offer total read
  "excluding items awaiting valuation", and the offer is flagged `is_incomplete`.
- The configuration **saves and submits anyway** — that is the whole point of CC-5.
- In the **priced track it blocks the cart.** A partner cannot check out a configuration containing an
  unpriced position; the action changes from "Dodaj do koszyka" to "Wyślij zapytanie o wycenę" and the
  submission goes down track 2. This is a decision this spec makes: the alternative — ordering part of
  a configuration — splits a drawing across two commercial documents and loses the thing that made it
  coherent.
- **Forcing a non-standard variant** (s10's stronger alternative) is internal mode only, requires
  confirmation, and is recorded on the revision with the acting user. It converts a `custom_item` into
  a priced line with a hand-entered price and a permanent marker.

### 3.7 Modes — one engine, four resolutions (C3)

Mode is computed once per request from the caller's identity and the partner's terms, and then only
ever read:

| Resolution | Who | Sees | Can |
|---|---|---|---|
| `internal` | Staff with `anter_configurator.internal` | List price, partner price, **and** cost and margin when they also hold `anter_configurator.margin.view` | Draw the full internal catalogue including products outside this partner's price list; force a non-standard variant; hand off to an offer or a CRM deal |
| `partner_priced` | Portal user whose partner terms are `account_type = 'full'` | Their contract price only | Draw products inside their price-list scope; save; add to cart |
| `partner_unpriced` | `account_type = 'hidden'` | No price anywhere — availability dates remain visible | Draw the same products; save; send a quote request |
| `denied` | `account_type = 'preview'`, or a portal user without `portal.configurator.use` | Nothing | Nothing — a `403` whose body names what is missing and who to contact |

Three rules make this one engine rather than three:

1. **The same endpoints serve every resolution.** There is no `?mode=`, no separate portal API, no
   duplicated page. The projection differs; the query does not.
2. **Prices are omitted, not nulled.** In `partner_unpriced`, price fields are absent from the JSON
   entirely. A `null` price invites a client to render a dash where a number belongs and invites a
   future developer to "fix" it. The same rule governs cost and margin outside `internal`.
3. **`denied` is explained, not blank.** s12's design principle — a named restriction produces
   understanding, a greyed-out field produces a ticket to the administrator — applies to the whole
   mode ladder. The `403` body carries `{ error, missing, contactOwnerName, contactOwnerEmail }`,
   sourced from the partner's assigned account owner in CRM.

**Products outside the partner's price list** (s9's dashed element 5) are the one place where the
modes see different *geometry*, and they deliberately do not: the element is stored identically, and
the partner opening the same project sees it rendered as `to_quote` with no price rather than not
seeing it at all. Hiding an element a colleague drew would make the two views of one project
disagree about what is being built — the exact failure the single-engine decision exists to prevent.

### 3.8 Revisions, acceptance and supersession (C10)

Every submission and every offer references an exact `revision_id`. When a new revision is created on
a project:

- the previous revision's `technical_acceptance_state` becomes `stale` — the acceptance stands as a
  historical fact about a drawing nobody is building any more;
- every `issued` offer bound to the previous revision becomes `superseded`;
- any `open` submission bound to it moves to `revision_requested` and re-enters the queue against the
  new revision, keeping its comment history.

Ordering from a superseded offer fails with
`409 { error: 'revision_superseded', supersededByRevisionId, currentOfferId }`. Adding a superseded
revision's BOM to the cart fails the same way. This is the working application's rule (s30's "Projekt
ma nowszą rewizję — nie można na jej podstawie zgłosić nowego zamówienia"), and it is the single most
valuable thing that application proved, because the failure it prevents — manufacturing to a drawing
the customer has already changed — is the expensive one.

**Two different locks, not to be confused.** The repository's optimistic locking (`updated_at` header,
`409` conflict bar) protects against *concurrent edits of one row* and applies here as it applies
everywhere — every user-editable entity in §Data Model carries `updated_at` and every form derives the
header. Revision binding protects against *acting on a stale document*. A user can hit both in one
session and they mean different things; the error bodies are therefore distinct
(`optimistic_lock_conflict` vs `revision_superseded`) and the UI messages name different remedies.

### 3.9 The submission workflow (s46, US-4.6, A-29)

One queue, two tracks, decided by whether the configuration had a price.

```
track = 'priced'    (partner_priced or internal with a price)
   submitted ──▶ technical_review ──accept──▶ closed_order
                       │
                       ├──request_changes──▶ revision_requested   (partner redraws → new revision)
                       └──reject──────────▶ rejected

track = 'unpriced'  (partner_unpriced, or priced-with-custom-items)
   submitted ──▶ technical_review ──accept──▶ valuation ──issue──▶ closed_offer
                       │                          │
                       ├──request_changes──▶ revision_requested
                       └──reject──────────▶ rejected
```

**Order of steps is fixed and technical-first.** The prototype's reasoning is adopted verbatim:
valuing a project the constructor will send back to be redrawn is work thrown away.

**Technical revision is in both tracks** (US-4.6). The configurator derives quantities from geometry
but rules on nothing about installability — anchoring into the floor, collision with an installation,
service access. That judgement is a person's, every time, including when the price is already known.

**C9 — what "priced track" means for the order.** The partner's configuration goes into the cart and
through the companion spec's checkout, so an `AnterOrder` exists in status `placed` immediately —
s13's own wording, and s46's closed row showing `KNF-2026-0405 → ZAM-2026-1187`. Technical acceptance
then gates the transition to `confirmed`, enforced by the mutation guard in §3.2. Between placement
and acceptance the partner sees "Zamówienie przyjęte — w rewizji technicznej"; nothing is allocated,
nothing is produced.

**A-29's open tail, resolved at the system level only.** The prototype leaves open what happens when a
constructor rejects a revision *after* a priced order exists. This spec gives the situation a state
and both exits, and leaves the commercial choice to the people holding it:

- the order moves to `technical_hold`, a status added in §3.16;
- the partner is notified with the constructor's technical comment — not with an internal reason;
- staff can take either exit from the order screen: **amend** (the partner redraws, a new revision is
  bound to the same order, allocation resumes) or **cancel** (the companion spec's placement undo
  path, which compensates rather than erases).

Automating that choice is not possible without knowing who absorbs the cost, and that is the
unresolved business question the prototype flags. §Open questions carries it forward.

**The queue (s46).** One row per submission: number `KNF-YYYY-NNNN`, partner and account type,
project and configuration value or position count, track, current state and a waiting counter. Four
KPI tiles: in technical review, in valuation, overdue, closed today. Filter tabs matching the states.
"Overdue" is `now > due_at`, where `due_at` is set per assignment with a tenant-configurable default
of two working days — A-5's sibling problem, handled the same way (§3.12).

**Comments are anchored** (proven by s29): a comment carries an optional `element_id`, so "the anchor
at column K12" is attached to the element rather than to the project. The comment thread is visible to
the partner in the portal — technical scope only, no prices, no margins, no commercial notes, which
is the same data split the working application already enforces.

### 3.10 Offers (C7, CC-4)

An offer is what the unpriced track produces and what the investment path produces (s11). It is a
commercial document bound to exactly one revision.

- **`offer_number` is assigned once** in the format `OF-YYYY-NNNN`, from a per-tenant sequence, and is
  carried onto the order it becomes and onto everything downstream (CC-4). It is never regenerated —
  a revised offer supersedes and gets a new number rather than mutating an issued one.
- **Statuses**: `draft` → `issued` → `accepted` | `rejected` | `expired` | `superseded`. Only `issued`
  is visible to the partner; only `accepted` can produce an order.
- **Totals** come from `salesCalculationService` on the same `SalesLineSnapshot` shape the companion
  spec defines, including a `kind: 'shipping'` line when transport is quoted. This is the reuse that
  makes §3.11's equality requirement achievable.
- **Incompleteness is first-class**: `is_incomplete` plus a reason, set when any `custom_item` on the
  bound revision lacks a price. An incomplete offer can be issued — the source document requires it —
  and every surface that renders it renders the flag, including the generated document. Silent
  incompleteness is the failure mode this field exists to prevent.
- **Validity**: `valid_until`, defaulting to 30 days, tenant-configurable. An expired offer cannot
  produce an order; it can be reissued, which supersedes it.
- **Acceptance** is a portal action on the offer detail page. It places an order through the companion
  spec's `anter_orders.order.place` command with an offer source rather than a cart source (§3.16),
  freezing the offer's line prices onto the order — an accepted offer is a price commitment, so this
  is the one placement path that must **not** re-price (the companion spec's §3.3 re-prices from the
  cart, deliberately; the reason differs here and the difference is the point).

### 3.11 Money: one arithmetic, three documents

A configuration is priced three times on its way to an invoice — in the configurator panel, on the
offer, and on the order. All three go through the companion spec's `salesCalculationService` call
(its D5, §3.5) on the same line snapshots, because three implementations of tax and rounding produce
three answers and the partner sees all three.

The equality is asserted, not assumed: an integration test builds one revision, renders its panel
total, issues an offer from it, accepts the offer into an order, and asserts the three grand totals
are identical to the stored scale. This test is the reason C7 could be taken without re-implementing
arithmetic.

One asymmetry is deliberate and documented at both ends: **cart checkout re-prices, offer acceptance
does not.** A cart is a shopping intent and the current price applies; an issued offer is a price
commitment with a validity date, and re-pricing it would make the date meaningless.

### 3.12 CRM feedback (CC-6, US-3.5)

Commercial events create a CRM object immediately; light events aggregate. Subscribers live in
`anter_configurator` and write through the `customers` public API, never by entity access — the same
pattern and the same constraint the companion spec fixed for orders.

| Event | Weight | CRM effect |
|---|---|---|
| `anter_configurator.quote_request.sent` | Commercial | Activity on the partner company **and**, when the partner has no open deal, a `customer_deal` in the configured pipeline's first stage, assigned to the account owner |
| `anter_configurator.offer.issued` | Commercial | Activity carrying offer number, value and validity; linked to the deal |
| `anter_configurator.offer.accepted` | Commercial | Activity; the deal advances to the configured "won" stage |
| `anter_configurator.submission.changes_requested` | Commercial | Activity — the partner is waiting on Anter, and the account owner should know |
| `anter_configurator.project.abandoned` | Commercial | Task for the account owner, carrying the project, its value and its age (US-3.5) |
| `anter_configurator.project.saved` | Light | Aggregated into the partner-card figures; no individual activity |

**Abandonment (A-5) is configurable, not hardcoded.** A worker runs daily and raises
`project.abandoned` for a project whose latest revision is `draft`, older than
`abandonedAfterDays` (default 14) and whose computed value exceeds `abandonedMinValue` (default
10 000, in the tenant's base currency). Both are tenant settings with the defaults documented,
because the prototype's A-5 explicitly records that no threshold has been agreed. Raising an alert on
a number nobody chose is worse than raising none; making the number visible and editable is the
honest middle.

The partner-card figures themselves belong to the companion spec's `anterPartnerStatsService`. This
spec contributes two computed figures to it — open configurations and their value — through the same
widget, and does not build a second partner card.

### 3.13 Cross-module dependencies and module-absent behaviour

| Peer | Mechanism | Owner | If the peer is absent |
|---|---|---|---|
| `catalog` | Direct service use + custom fields + FK ids | `anter_configurator` | **Hard.** Nothing to draw with |
| `anter_orders` | DI services (`anterPartnerPricingService`, `anterPartnerTermsService`), command `order.place`, a registered mutation guard | `anter_configurator` | **Hard.** Declared in `index.ts`. Without partner terms there is no mode resolution and no price |
| `anter_portal` | Command `anter_portal.cart.add_lines` | `anter_configurator` | **Hard** for the priced track. Declared |
| `customer_accounts` / `portal` | Portal auth context and page contribution | `anter_configurator` | **Hard** |
| `customers` | Public API for activities, deals and tasks | `anter_configurator` | **Hard.** The partner *is* a CRM company |
| `attachments` | Underlay files, generated offer documents, drawing exports | `anter_configurator` | **Soft-optional.** Without it there is **no underlay**, so the configurator refuses to create a project with a clear message rather than offering a blank canvas; existing projects stay readable and their BOMs stay computable. Offers render in the browser and lose only the stored PDF |
| `sales` | `salesCalculationService`, through the companion spec's guarded resolution | `anter_orders` | **Soft-optional**, inherited. This module never resolves it directly |
| `events`, `queue` | `createModuleEvents`, persistent subscribers, the abandonment worker | platform | Always present |

`attachments` is the interesting one: it is soft-optional in the companion spec and *nearly* hard
here, because a plan underlay is not a nice-to-have. The behaviour above — refuse to create, keep
existing readable — is what "nearly hard" has to mean, and it gets its own module-absent test.

### 3.14 Access control

**Staff features** (`anter_configurator/acl.ts`), granted to `admin` and `superadmin` through
`setup.ts` `defaultRoleFeatures`:

| Feature | Grants |
|---|---|
| `anter_configurator.view` | Read projects, revisions, submissions, offers |
| `anter_configurator.internal` | Draw in internal mode — full catalogue, partner-independent |
| `anter_configurator.margin.view` | See cost and margin (s9's rows; s12 is this feature absent) |
| `anter_configurator.review` | Technical decisions: accept, request changes, reject (the constructor) |
| `anter_configurator.value` | Price custom items, build and issue offers (the back office) |
| `anter_configurator.force_variant` | Force a non-standard variant (§3.6) |

`review` and `value` are separate features for the reason s46 separates the two steps: they are
different people with different competence, and the queue's whole value is that each sees only what
they can decide.

**Portal features** (`anter_configurator/acl.ts`, `portal.<area>.<action>` convention), declared in
`setup.ts` `defaultCustomerRoleFeatures`:

| Feature | Seeded on | Notes |
|---|---|---|
| `portal.configurator.use` | `buyer` | Draw, save, submit. A `viewer` browses and tracks but does not draw |
| `portal.offers.view` | `buyer`, `viewer` | See issued offers |
| `portal.offers.accept` | `buyer` | Turn an accepted offer into an order |

Existing tenants replay these with `yarn mercato customer_accounts sync-customer-role-acls`, and the
companion spec's warning applies unchanged: `CustomerRbacService` caches ACLs for five minutes, so the
runbook step is not optional.

**Feature is necessary, account type is sufficient.** `portal.configurator.use` decides *whether* a
portal user may draw; `account_type` decides *what they see* (§3.7). A `preview` account holding the
feature is still `denied` — the terms win, because they are the contract.

**Declaration shape and tenant isolation** follow the companion spec §3.10 without deviation:
per-method `metadata` guards, never a top-level export; every query filtered by `organization_id` and
`tenant_id`; every portal query additionally filtered by the `customerEntityId` from the customer JWT;
another partner's project id returns `404`, not `403`.

### 3.15 Underlays and plan points

**The underlay** is an uploaded raster or PDF, stored through `attachmentService` on a dedicated
non-public partition. Constraints: `image/png`, `image/jpeg`, `application/pdf`; maximum 25 MB; PDFs
use page 1. A downscaled preview (longest edge 2400 px) is generated on upload and is what the canvas
loads, because a 25 MB original in an SVG background stalls a laptop.

An underlay is **a customer's site plan** — not personal data, but commercially confidential and
sometimes security-relevant (it shows where the doors are). It is therefore never placed on a public
partition, never rendered into a shareable URL, and access is checked through `checkAttachmentAccess`
on every read, per the `attachments` module's absolute rule.

**Plan points (C12)** are the coverage card on s13 and s14. They are **declared**, by whoever prepares
the project — points of a named kind (`rack_corner`, `column`, `crossing`, `dock`,
`technical_entrance`, `charging_station`) placed on the plan. Coverage is then computed, not declared:
a point is `covered` when an element whose product is eligible for that kind lies within
`coverage_radius_m` (default 1.5), `skipped` when a user explicitly dismisses it with a reason, and
`open` otherwise.

The card reports per kind, exactly as the prototype draws it — 48/48 corners, 0/10 docks — and the
tool **does not force completeness**. Showing what is uncovered while leaving the scope to the drawer
is the prototype's stated principle and it is retained.

§Deviations 1 records that the prototype's label, "Punkty wykryte z planu" (points *detected* from the
plan), overstates this. They are entered.

### 3.16 Changes this spec makes to surfaces the catalogue spec owns

Every one of these is additive and reversible, and every one exists because the configurator path
needs something the catalogue path did not. They are listed here, in one place, so the two specs
cannot drift silently.

| # | Change | Where | Migration / default |
|---|---|---|---|
| X1 | `anter_partner_terms.account_type` — `full` \| `hidden` \| `preview` | `anter_orders` | New column, default `full`, so every existing row behaves exactly as before |
| X2 | `anter_partner_terms.account_owner_user_id` — the opiekun, used by the `denied` body and by CRM assignment | `anter_orders` | Nullable |
| X3 | `anter_partner_price_list_scope` — `(partner_terms_id, catalog_category_id, is_included)` | `anter_orders` | New table. **No rows means everything is included**, so behaviour without it is today's behaviour. Distinct from `anter_partner_group_discounts`, which prices; this one scopes (C14) |
| X4 | s17 gains two controls: account type and price-list scope | `anter_orders` back office | Rendered next to the existing discount editor |
| X5 | The portal catalogue list and tile views render the no-price variant (s45) when `account_type = 'hidden'`: both price columns replaced by a Parameters column, "Do koszyka" replaced by "Zapytaj o wycenę" routing to the configurator | `anter_portal` pages | Driven by the account type; the priced rendering is untouched |
| X6 | `GET /api/anter_portal/catalog` **omits** price fields for a `hidden` account and adds `parameters`; a product outside the price-list scope returns `availability: 'outside_price_list'` | `anter_portal` API | Omission, not nulling (§3.7 rule 2). New availability value is additive |
| X7 | `anter_orders.source` starts carrying `configurator` and `crm_offer`; new nullable `offer_id` and `configurator_revision_id` columns | `anter_orders` | The column and its values were reserved by the companion spec for exactly this |
| X8 | `anter_orders.status` gains `technical_hold` (§3.9) | `anter_orders` | Additive status, rendered in the warning role. Only reachable for configurator-sourced orders |
| X9 | `anter_orders.order.place` accepts an **offer source** in addition to a cart source, and does not re-price in that mode (§3.10) | `anter_orders` command | Additive branch; the cart branch is unchanged, including its `409` |
| X10 | `anter_orders.order.confirm` is constrained by a mutation guard registered from this module (§3.2) | `anter_orders` command | No-op when this module is absent |
| X11 | `anter_order_lines.fulfilment_mode` starts carrying `production` | `anter_orders` | The column existed for this. **Interim behaviour, stated explicitly**: a `production` line never reaches `packed`, so the order never auto-releases and appears in the release queue as partially ready with the line disabled and labelled "czeka na zlecenie" (A-27). Staff can ship the stock lines around it via the existing partial-shipment flow. Stage 4 replaces the label with a real production order |
| X12 | Two figures added to the partner-card widget: open configurations and their value | `anter_orders` widget | Additive fields in the same widget |
| X13 | `anter_portal.cart.add_lines` — a bulk command adding many priced lines to the active cart in one transaction | `anter_portal` command | **New.** The companion spec's `POST /cart/lines` adds one line and re-prices it; a BOM adds tens at once and a per-line loop would leave a half-filled cart on failure. The single-line endpoint is unchanged and keeps its own re-pricing |

X11 deserves the emphasis it has. It is the single place where this spec's scope boundary is visible
to a user rather than only to a reviewer, and the interim behaviour is deliberately a *visible stall*
rather than a silent one: the order sits in the queue saying what it is waiting for. A hidden stall
would be discovered by a partner asking where their gate is.

---

## 📝 Data Model

All tables carry `organization_id`, `tenant_id`, `created_at`, `updated_at`, `deleted_at` and a uuid
primary key; those columns are omitted below. Every user-editable entity has optimistic locking on by
default: `updated_at` is returned by list and detail APIs and `CrudForm` derives the lock header from
`initialValues.updatedAt` (§3.8's note on the two distinct locks applies).

### `anter_configurator`

**`anter_projects`** — a building and its commercial context.

| Column | Type | Notes |
|---|---|---|
| `project_number` | text | `KNF-P-YYYY-NNNN`, unique per tenant |
| `name` | text | "Magazyn DC Alfa — zabezpieczenia strefy regałowej" |
| `customer_entity_id` | uuid null | The partner company, when the project belongs to one |
| `customer_user_id` | uuid null | The portal user who created it |
| `customer_deal_id` | uuid null | CRM opportunity, for the investment path (s9's `SZ-2026-0344`) |
| `origin` | text | `portal` \| `internal` — who started it, not who may see it |
| `site_address_snapshot` | jsonb null | Where the building is. **Encrypted** (§Sensitive data) |
| `current_revision_id` | uuid null | Denormalised pointer; always the highest-lettered revision |
| `status` | text | `active` \| `abandoned` \| `closed` |

**`anter_project_revisions`** — a version of the drawing. Immutable once submitted.

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid | |
| `revision_label` | text | `A`, `B`, `C`… unique per project |
| `state` | text | `draft` \| `submitted` \| `accepted` \| `stale` \| `rejected` |
| `underlay_attachment_id` | uuid null | §3.15 |
| `underlay_width_units`, `underlay_height_units` | numeric(16,4) | The plan's own coordinate bounds |
| `metres_per_unit` | numeric(16,8) | From two-point calibration (C5) |
| `calibration_points` | jsonb null | The two clicked points and the typed distance, kept so a reviewer can check the calibration |
| `grid_size_m` | numeric(8,4) | Default `0.5` |
| `change_description` | text null | Why this revision exists |
| `bom_computed_at` | timestamptz null | When the server last recomputed (C4) |
| `bom_total_net_amount`, `bom_currency_code` | numeric(16,4) / text | Frozen at compute time; excludes custom items |
| `has_unpriced_items` | boolean | Any `custom_item` or `to_quote` line present |
| `technical_acceptance_state` | text | `none` \| `pending` \| `accepted` \| `changes_requested` \| `rejected` \| `stale` |
| `technical_accepted_by_user_id`, `technical_accepted_at` | uuid / timestamptz null | s27's "Sprawdził", with a real identity behind it |

Unique index on `(project_id, revision_label)`.

**`anter_project_elements`** — one drawn thing.

| Column | Type | Notes |
|---|---|---|
| `revision_id` | uuid | |
| `element_kind` | text | `run` \| `point` \| `insert` \| `annotation` |
| `product_id`, `product_variant_id` | uuid null | Null for `annotation` |
| `sku_snapshot`, `name_snapshot` | text null | Display without a catalogue round-trip |
| `geometry` | jsonb | `{ vertices: [[x,y],…] }` for `run`; `{ position: [x,y], rotation }` for `point` and `insert` |
| `host_element_id` | uuid null | `insert` only — the run it is placed on |
| `host_offset_ratio` | numeric(9,6) null | `insert` only — parametric position along the host, 0…1 |
| `label` | text null | The plan legend number and any note |
| `is_outside_price_list` | boolean | Computed at save; drives s9's dashed rendering |
| `sort_order` | integer | Stable drawing order |

**`anter_bom_lines`** — derived, frozen per revision.

| Column | Type | Notes |
|---|---|---|
| `revision_id` | uuid | |
| `product_id`, `product_variant_id`, `sku`, `name_snapshot` | | Snapshotted |
| `origin` | text | `drawn` \| `derived` \| `manual` (§3.5 step 6) |
| `source_element_ids` | jsonb | Which elements produced this line — the audit trail for a number nobody typed |
| `quantity` | numeric(16,4) | |
| `unit_code` | text | `m`, `pcs`, `set` |
| `realised_length_m`, `residual_length_m` | numeric(16,4) null | Line products only (§3.5 step 2) |
| `module_count`, `post_count`, `anchor_count` | integer null | The derivation made inspectable |
| `list_unit_price_net`, `partner_unit_price_net`, `discount_rate` | numeric | From `anterPartnerPricingService`; omitted from unpriced projections, not nulled |
| `unit_cost_net` | numeric null | Internal mode only, gated by `anter_configurator.margin.view` |
| `price_state` | text | `priced` \| `to_quote` (§3.6) |
| `net_amount` | numeric(16,4) null | |

**`anter_custom_items`** — CC-5 positions with no catalogue product.

`revision_id`, `description` (constructor-facing, required), `quantity`, `unit_code`,
`assigned_constructor_user_id` null, `valuation_state` (`awaiting` \| `priced` \| `declined`),
`unit_price_net` null, `priced_by_user_id` null, `priced_at` null, `forced_variant_of_product_id` null
(§3.6's forcing path), `forced_by_user_id` null.

**`anter_plan_points`** — C12.

`revision_id`, `point_kind`, `position` (jsonb `[x,y]`), `state` (`open` \| `covered` \| `skipped`),
`skip_reason` text null, `covered_by_element_id` uuid null, `coverage_radius_m` numeric.

**`anter_submissions`** — the s46 queue row.

| Column | Type | Notes |
|---|---|---|
| `submission_number` | text | `KNF-YYYY-NNNN`, unique per tenant |
| `project_id`, `revision_id` | uuid | The revision binding that C10 invalidates |
| `customer_entity_id` | uuid null | |
| `track` | text | `priced` \| `unpriced` (§3.9) |
| `state` | text | `technical_review` \| `valuation` \| `closed_order` \| `closed_offer` \| `revision_requested` \| `rejected` |
| `assigned_user_id` | uuid null | Constructor in `technical_review`, back office in `valuation` |
| `due_at` | timestamptz null | Drives "po terminie" |
| `submitted_at`, `closed_at` | timestamptz null | |
| `resulting_order_id`, `resulting_offer_id` | uuid null | The queue's closed rows link to what they became |
| `value_net_amount`, `currency_code` | numeric / text null | Absent for unpriced submissions |
| `position_count` | integer | What an unpriced row shows instead of a value |

**`anter_submission_comments`** — `submission_id`, `element_id` null (the anchoring from s29),
`author_user_id` or `author_customer_user_id`, `body`, `visibility` (`shared` \| `internal`).
`shared` is technical scope only and is what the portal renders.

**`anter_submission_events`** — the audit trail C8 forfeited by not using `workflows`, so it is built:
`submission_id`, `from_state`, `to_state`, `actor_user_id` or `actor_customer_user_id`, `reason`,
`occurred_at`.

**`anter_offers`**

| Column | Type | Notes |
|---|---|---|
| `offer_number` | text | `OF-YYYY-NNNN`, unique per tenant, assigned once (CC-4) |
| `submission_id` | uuid null | Null for an offer built directly in internal mode (s11) |
| `project_id`, `revision_id` | uuid | |
| `customer_entity_id`, `customer_deal_id` | uuid / uuid null | |
| `status` | text | `draft` \| `issued` \| `accepted` \| `rejected` \| `expired` \| `superseded` |
| `currency_code`, `valid_until` | text / date | |
| `is_incomplete`, `incomplete_reason` | boolean / text null | §3.10 |
| `subtotal_net_amount`, `discount_total_amount`, `shipping_net_amount`, `tax_total_amount`, `grand_total_net_amount`, `grand_total_gross_amount` | numeric(16,4) | Straight from `SalesDocumentAmounts` |
| `delivery_terms`, `payment_terms_text`, `lead_time_text` | text null | s30's "Zakres dostawy, płatność i termin" |
| `document_attachment_id` | uuid null | The generated PDF |
| `issued_at`, `accepted_at`, `superseded_by_offer_id` | | |

**`anter_offer_lines`** — `offer_id`, `line_number`, `bom_line_id` null, `custom_item_id` null,
`product_id`/`variant_id`/`sku`/`name_snapshot`, `quantity`, `unit_code`, `list_unit_price_net`,
`unit_price_net`, `discount_amount`, `tax_rate`, `net_amount`, `gross_amount`,
`is_awaiting_valuation` boolean.

### Additive changes to `anter_orders` and `anter_portal`

Specified in §3.16 (X1, X2, X3, X7, X8, X11). Each ships as a migration in the owning module, not in
`anter_configurator` — a module never migrates another module's tables.

### Sensitive data

`anter_projects.site_address_snapshot` is a postal address and, when the project serves the partner's
own end customer, a third party's address. It is GDPR-relevant by this repository's convention and
MUST be declared in `anter_configurator/encryption.ts` `defaultEncryptionMaps`, with every read going
through `findWithDecryption` / `findOneWithDecryption`.

**Underlay files are not encrypted at rest by this module** — they are `attachments` rows and inherit
that module's storage. They are confidential (§3.15) and protected by partition and access check, not
by field encryption. This is stated rather than silently assumed, because a site plan is the most
sensitive artefact this feature handles and a reviewer will look for the decision.

`project_number`, `submission_number` and `offer_number` are business identifiers, deliberately
unencrypted and searchable — the same exception, for the same reason, that the companion spec takes
for `order_number`.

### Migrations

One migration set in `anter_configurator`, plus one additive set each in `anter_orders` and
`anter_portal` for §3.16. Generated with `yarn db:generate` and reviewed together with
`migrations/.snapshot-open-mercato.json`. Unrelated generated output is deleted rather than applied,
per the repository's coding-agent exception.

Custom-field definitions in `ce.ts` are registered through the standard mechanism and require
`yarn generate` plus `yarn mercato configs cache structural --all-tenants`, not a schema migration.

---

## 📝 API Contracts

Standard CRUD is `makeCrudRoute` with `indexer: { entityType }` and zod validators in
`data/validators.ts`, following the `customers` reference module. Only the non-derivable shapes are
specified.

### Portal (`anter_configurator`) — customer auth

| Method · Path | Feature | Notes |
|---|---|---|
| `GET /api/anter_configurator/portal/projects` | `portal.configurator.use` | The partner's projects with current revision and value. Value omitted in `partner_unpriced` |
| `POST /api/anter_configurator/portal/projects` | `portal.configurator.use` | Creates project + revision `A`. `409 { error: 'underlay_unavailable' }` when `attachments` is absent (§3.13) |
| `POST /api/anter_configurator/portal/projects/[id]/underlay` | `portal.configurator.use` | Multipart via `attachmentService.readUploadForm()`. Returns preview dimensions |
| `PUT /api/anter_configurator/portal/revisions/[id]/calibration` | `portal.configurator.use` | Two points + distance. `409 { error: 'revision_locked' }` after submission (C5) |
| `PUT /api/anter_configurator/portal/revisions/[id]/elements` | `portal.configurator.use` | Whole-revision element set, replaced transactionally. Recomputes the BOM server-side and returns it (C4) |
| `GET /api/anter_configurator/portal/revisions/[id]/bom` | `portal.configurator.use` | The authoritative BOM. Prices omitted entirely in `partner_unpriced`; cost and margin never present |
| `GET /api/anter_configurator/portal/revisions/[id]/points` · `PUT …/points` | `portal.configurator.use` | Declared points and their coverage (§3.15) |
| `POST /api/anter_configurator/portal/revisions/[id]/add-to-cart` | `portal.configurator.use` + `portal.orders.create` | Priced track. Recomputes, then calls `anter_portal.cart.add_lines`. `409` when any line is `to_quote` or any custom item is unpriced (§3.6) |
| `POST /api/anter_configurator/portal/revisions/[id]/quote-request` | `portal.configurator.use` | Creates the submission on the unpriced track, emits `quote_request.sent` |
| `POST /api/anter_configurator/portal/revisions/[id]/branch` | `portal.configurator.use` | Creates the next revision, copying elements, points and calibration |
| `GET /api/anter_configurator/portal/submissions[/id]` | `portal.configurator.use` | State, assignee-free, `shared` comments only |
| `POST /api/anter_configurator/portal/submissions/[id]/comments` | `portal.configurator.use` | Always `visibility: 'shared'` — a portal user cannot write an internal comment |
| `GET /api/anter_configurator/portal/offers[/id]` | `portal.offers.view` | `issued`, `accepted`, `expired`, `superseded` only. A `draft` offer is invisible |
| `POST /api/anter_configurator/portal/offers/[id]/accept` | `portal.offers.accept` | §3.10. Places an order at the offer's frozen prices |

Every portal response is scoped to the caller's `customerEntityId` from the customer JWT, never from a
request parameter; another partner's id returns `404`.

**Mode-denied body** (`403`), because s12's principle applies to the API as well as the screen:

```json
{ "error": "configurator_unavailable",
  "missing": "account_type",
  "accountType": "preview",
  "contactOwnerName": "Tomasz Rej",
  "contactOwnerEmail": "…" }
```

**Unpriced add-to-cart conflict** (`409`):

```json
{ "error": "configuration_not_orderable",
  "unpricedLineCount": 1,
  "customItemCount": 1,
  "suggestedAction": "quote_request" }
```

**Superseded revision** (`409`): `{ "error": "revision_superseded", "supersededByRevisionId": "…" }`.

### Back office (`anter_configurator`) — staff auth

| Method · Path | Feature | Notes |
|---|---|---|
| `GET /api/anter_configurator/projects` | `anter_configurator.view` | All projects, partner filter, deal filter |
| `PUT /api/anter_configurator/revisions/[id]/elements` | `anter_configurator.internal` | Internal mode draw. Accepts products outside the partner's price list |
| `GET /api/anter_configurator/revisions/[id]/bom` | `anter_configurator.view` | Adds `unitCostNet` and margin figures **only** with `anter_configurator.margin.view`; omits them otherwise (s12) |
| `GET /api/anter_configurator/submissions` | `anter_configurator.view` | The s46 queue. Filters by state, track, assignee, overdue. Keyset pagination |

Commands, each with `before` / `after` snapshots, guarded by `enforceCommandOptimisticLock`:

| Command | Effect | Undo |
|---|---|---|
| `anter_configurator.revision.compute_bom` | Recomputes and freezes BOM lines (C4) | Restore the previous line set and `bom_computed_at` |
| `anter_configurator.submission.create` | Opens a submission on a revision, sets track and due date, marks the revision `submitted` | Delete the submission, revision back to `draft` |
| `anter_configurator.submission.accept_technical` | `technical_review` → `valuation` (unpriced) or `closed_order` (priced); stamps the revision's acceptance | Reverse both, restore acceptance fields |
| `anter_configurator.submission.request_changes` | → `revision_requested`, notifies the partner with the shared comment | Reverse; the comment stays (it was read) |
| `anter_configurator.submission.reject` | → `rejected`; a priced order moves to `technical_hold` (§3.9) | Reverse both |
| `anter_configurator.custom_item.price` | Prices a CC-5 item; clears `is_incomplete` when it was the last one | Restore the prior price and the flag |
| `anter_configurator.offer.build` | Creates a `draft` offer from a revision, totals via `salesCalculationService` | Delete the draft |
| `anter_configurator.offer.issue` | `draft` → `issued`, assigns `offer_number`, renders the document, emits the CRM event | Back to `draft`; **the number is not released** and the CRM activity compensates rather than erases |
| `anter_configurator.offer.accept` | `issued` → `accepted`, places the order via `anter_orders.order.place` in offer mode | Cancel the order through the companion spec's undo; offer back to `issued` |

**Custom write routes run the mutation guard registry** — every command endpoint here maps to a
`create` / `update` / `delete` action, collects registered guards, appends `bridgeLegacyGuard(container)`
when present, calls `runMutationGuards(...)` with `{ userFeatures }` before mutating, merges
`modifiedPayload`, and runs the returned `afterSuccessCallbacks`, catching and logging callback
failures rather than failing the write.

**Irreversible effects.** `offer.issue` sends the offer to the partner and writes a CRM activity;
`submission.request_changes` notifies the partner. Undo compensates — it appends a withdrawal activity
and sends no second message — and each command's definition says so, so no caller assumes a clean
reversal. `offer_number` is deliberately never reused: a number that has been on a document sent to a
customer is spent.

### Events

`createModuleEvents`. `clientBroadcast` bridges to the back-office SSE stream, `portalBroadcast` to
the partner's.

| Event | clientBroadcast | portalBroadcast |
|---|---|---|
| `anter_configurator.project.saved` | no | no |
| `anter_configurator.quote_request.sent` | yes | yes |
| `anter_configurator.submission.created` | yes | yes |
| `anter_configurator.submission.technically_accepted` | yes | yes |
| `anter_configurator.submission.changes_requested` | yes | yes |
| `anter_configurator.submission.rejected` | yes | yes |
| `anter_configurator.offer.issued` | yes | yes |
| `anter_configurator.offer.accepted` | yes | yes |
| `anter_configurator.offer.expired` | yes | yes |
| `anter_configurator.project.abandoned` | yes | **no** |
| `anter_configurator.custom_item.priced` | yes | no |

Two deliberate asymmetries. `project.abandoned` is an internal sales signal — telling a partner the
system considers their draft abandoned is at best odd and at worst insulting. `custom_item.priced` is
an internal step; the partner learns of it when the offer arrives, as one fact rather than two.

---

## 📝 UI/UX

The canonical mechanisms are not optional and are not restated here beyond the deltas: `DataTable`
with stable `entityId`s, `CrudForm` with `createCrud`/`updateCrud`/`deleteCrud`, `useGuardedMutation`
for every non-`CrudForm` write, `apiCall` rather than `fetch`, `LoadingMessage`/`ErrorMessage`,
`<Alert>` / `<StatusBadge>` / `flash(...)` / `useConfirmDialog()`, `lucide-react` at `size-4`/`size-5`,
`useT()` and `resolveTranslations()` with keys under `anter_configurator.*`, semantic status tokens
only, `Cmd/Ctrl+Enter` submit and `Escape` cancel in every dialog, `pageSize` at or below 100.
Entity ids: `anter_configurator.project`, `.submission`, `.offer`.

### The plan canvas

The one component with no precedent in `packages/ui`, so its contract is specified rather than left to
implementation.

- **SVG, not `<canvas>`.** Elements must be individually selectable, focusable, labelled and styleable
  with design-system tokens; a bitmap canvas gives up all four and would need a parallel hit-testing
  structure. At Anter's element counts — tens to low hundreds — SVG's cost is irrelevant.
- **The underlay is an `<image>`** at the revision's unit dimensions; the viewport is a `viewBox`, so
  zoom and pan are attribute changes and never re-layout.
- **One client component**, `PlanCanvas.tsx`, taking elements and emitting element changes. It owns no
  data fetching; the page fetches server-side and passes props, per the companion spec's frontend
  contract.
- **Keyboard is not optional.** Tab moves between elements, arrows nudge a selected vertex by one grid
  step, `Escape` cancels an in-progress draw, `Enter` closes a run, `Delete` removes the selection.
  A drawing tool that can only be used with a mouse fails the repository's accessibility baseline, and
  it is easier to build this in than to retrofit it.
- **Colour carries meaning through tokens only**: a normal element in the primary role, an element
  outside the partner's price list in the warning role with a dashed stroke (s9's element 5), a
  selected element in the accent role, an uncovered plan point in the info role. No hex, no
  `text-amber-*`, no `dark:` override.
- **The BOM panel updates optimistically** from the client computation and reconciles against the
  server's response (C4). Reconciliation is silent when the numbers match and replaces them when they
  do not; it never shows both.

### Portal pages (`anter_configurator/frontend/[orgSlug]/portal/…`)

Contributed exactly as `warranty_claims` does — `page.tsx` beside `page.meta.ts` with
`requireCustomerAuth: true`, `requireCustomerFeatures` and a `nav` entry.

| Path | Screen | Notes |
|---|---|---|
| `configurator/page.tsx` | s13, s14 left rail | Project list: saved projects with value (priced) or position count (unpriced), and "new project" |
| `configurator/[projectId]/page.tsx` | s13, s14 | The workspace: tool bar, canvas, product panel, coverage card, BOM panel. One page for both modes; the mode changes the projection, not the layout. The primary action is "Dodaj do koszyka" (`partner_priced`) or "Wyślij zapytanie o wycenę" (`partner_unpriced`) |
| `configurator/[projectId]/submissions/[id]/page.tsx` | derived from s29 | Submission state, the technical comment thread, and the redraw action when changes were requested |
| `offers/page.tsx` · `offers/[id]/page.tsx` | s11 seen from the partner's side | Issued offers, validity, the incompleteness banner, and "Zamów" on an accepted-able offer |

The catalogue pages (s35, s42, s45) stay in `anter_portal`; X5 changes their rendering there rather
than cloning them here.

### Back-office pages (`anter_configurator/backend/anter_configurator/…`)

| Path | Screen | Notes |
|---|---|---|
| `projects/page.tsx` · `projects/[id]/page.tsx` | — | Project list and detail with the revision history |
| `projects/[id]/draw/page.tsx` | s9 | The same workspace in internal mode: cost and margin rows when the feature is held, the full catalogue, the dashed out-of-price-list rendering, "Przekaż do oferty" |
| `projects/[id]/valuation/page.tsx` | s11, s12 | The quote view. With `margin.view`: list value, cost, margin at list, margin after discount. Without it: the same totals, plus the explicit "Niedostępne w tej roli" list and a "Przekaż opiekunowi" action — **never a greyed-out empty field** |
| `submissions/page.tsx` | s46 | The queue: four KPI tiles, the two track explainers, state tabs, SLA counters, per-row action matching the state (`Przejmij` / `Wyceń` / open the resulting order or offer) |
| `submissions/[id]/page.tsx` | derived from s29 | Read-only drawing view, the element-anchored comment thread with the internal/shared toggle, and the three decisions |
| `custom-items/page.tsx` | s10's downstream | Items awaiting a constructor's price, across projects |
| `offers/page.tsx` · `offers/[id]/page.tsx` | s11 | Offer list and builder; issue action; supersession visible |

### Frontend architecture contract

Pages are React Server Components by default. The `"use client"` ledger:

| Client file | Why |
|---|---|
| `PlanCanvas.tsx` | Drawing, selection, snapping, zoom and pan |
| `BomPanel.tsx` | Optimistic recompute and server reconciliation |
| `ProductPalette.tsx` | Tool selection and category filter |
| `CalibrationDialog.tsx` | Two-point picking |
| `SubmissionDecisionBar.tsx` | The three decisions with confirmation |
| `OfferBuilder.tsx` | Line editing and total recompute |

No provider is added at the portal root; data is fetched server-side and passed as props.

---

## 📝 Edge Cases & Failure Scenarios

| Case | Behaviour |
|---|---|
| Underlay upload fails or exceeds 25 MB | Project stays in `draft` with no underlay; a retry action on the same project. Other uploads unaffected |
| Calibration is never performed | The canvas draws, the BOM computes **nothing** and says why. Length without scale is not a number |
| Calibration attempted after submission | `409 revision_locked`, with "create revision B" offered (C5) |
| A run shorter than one module | Validation error at draw time naming the module length; the element is not persisted |
| An insert wider than its host segment | Rejected with the available clearance named |
| A product's `anter_module_length_m` changes after a BOM was frozen | Frozen lines are untouched. The next recompute uses the new value and the revision shows a "geometry data changed" notice with a recompute action — never a silent change |
| Partner's discount changes between drawing and checkout | The companion spec's re-pricing at placement applies unchanged; the `409` price-change body is theirs |
| Partner's account switches `full` → `hidden` mid-session | The next request resolves `partner_unpriced`; prices vanish from responses. Any cart lines already placed remain — they are the companion spec's, and a contract change is not retroactive to a placed intent |
| Partner is ordering-blocked (A-4) and tries to add a configuration to the cart | The companion spec's `403 ordering_blocked` with no reason. Drawing and quote requests remain available — blocking payment is not blocking design |
| Two portal users of one partner edit one revision | Optimistic lock `409` with the standard conflict bar. The element set is replaced transactionally, so the loser reloads rather than merging |
| A constructor accepts a revision that was superseded while they reviewed | Refused: the submission moved to `revision_requested` on supersession (§3.8); the decision bar shows the new revision |
| Offer expires between issue and acceptance | `409 offer_expired` with a reissue path for staff. The partner sees the state, not a broken button |
| An offer is accepted twice concurrently | One order. The acceptance command is optimistically locked on the offer; the second attempt gets `409` |
| A custom item is declined rather than priced | The offer issues incomplete with the item marked declined, or staff remove it from the offer. It is never silently priced at zero |
| `attachments` disabled | New projects refused with a clear message; existing projects readable and computable (§3.13) |
| A configurator order contains a `production` line | X11: no auto-release, visible stall labelled "czeka na zlecenie", stock lines shippable around it |
| A plan point's covering element is deleted | The point returns to `open` at the next recompute. Coverage is derived, never stored as a decision |

---

## 📝 Performance, Indexing and Caching

### The two loops that matter

**BOM recompute** is `O(elements × segments)` with a small constant and runs on every geometry save.
At the expected scale — under 500 elements per revision — it is single-digit milliseconds of
arithmetic. What it must not do is issue a query per line: product geometry fields for the whole
revision load in one batched custom-field read, and prices resolve through **one**
`resolveCatalogPriceBatch` per revision, exactly as the companion spec requires of catalogue pages.
The test asserts the query count, not only the numbers.

**The queue (s46)** joins submissions to projects and partners for display. Those are snapshotted
onto the submission row (`value_net_amount`, `position_count`, partner name via the standard read
service) so the list is one query plus one batched partner resolve, not one per row.

### Indexes

| Table | Index | Serves |
|---|---|---|
| `anter_projects` | `(organization_id, customer_entity_id, status)` | Portal project list |
| `anter_projects` | `(organization_id, status, updated_at)` partial `WHERE status = 'active'` | Abandonment worker |
| `anter_project_revisions` | `(project_id, revision_label)` unique | Revision lookup and branching |
| `anter_project_elements` | `(revision_id, sort_order)` | Canvas load |
| `anter_bom_lines` | `(revision_id, origin)` | BOM panel and offer build |
| `anter_plan_points` | `(revision_id, point_kind, state)` | Coverage card |
| `anter_submissions` | `(organization_id, state, due_at)` | Queue, overdue tile |
| `anter_submissions` | `(organization_id, assigned_user_id, state)` | "My queue" |
| `anter_submissions` | `(revision_id)` | Supersession cascade |
| `anter_offers` | `(organization_id, customer_entity_id, status)` | Portal offer list |
| `anter_offers` | `(organization_id, status, valid_until)` partial `WHERE status = 'issued'` | Expiry worker |
| `anter_offers` | `(offer_number)` unique per tenant | CC-4 lookup |

Growing lists — projects, submissions, offers — use keyset pagination, not offset.

### Caching

Through the DI-resolved cache with tenant and organization tags, never a module-local map.

| Cached | TTL | Invalidated by |
|---|---|---|
| Product geometry fields per organization | 10 min | `catalog.product.updated`, custom-field value change |
| The drawable-product list per (organization, partner scope) | 5 min | Product or price-list-scope change |
| Underlay preview bytes | Immutable, content-addressed | Never — a new underlay is a new attachment |

**Never cached:** prices (the companion spec's rule, and CC-3 requires a terms change to take effect
immediately), BOM results (they are the authoritative computation), submission and offer state.

---

## 📝 Risks & Impact Review

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **The canvas and geometry engine are the schedule.** No primitive exists in `packages/ui`; drawing, snapping, calibration, zoom/pan, keyboard access and hit-testing are all new, and none of them is the kind of work that shrinks when estimated optimistically | **Critical** | Phasing isolates it: Phase F ships the server-side engine with no canvas at all and is testable by fixtures, so the arithmetic is proven before any pixel is drawn. Phase G is then a rendering problem against a known-good model. Residual: the calendar risk remains real and is the reason C1's alternatives (port, integrate) were considered and rejected knowingly |
| R2 | **Two BOM implementations drift.** The browser and the server compute the same numbers; a divergence shows the partner one price and charges another | **Critical** | C4 makes the server authoritative and the client advisory, so drift is a display artefact rather than a pricing bug. Shared fixture tests assert identical output to four decimals. Residual: a silent client-side error still misleads until reconciliation, which is why reconciliation replaces rather than merges |
| R3 | **A geometry-field edit in `catalog` changes quantities on live projects.** Module length is a commercial input disguised as a product attribute | High | Frozen BOM snapshots per revision; an explicit "geometry data changed" notice with a manual recompute; an accepted revision never recomputes automatically. Residual: a project in `draft` for months quietly reprices at the next recompute — mitigated by the notice, not eliminated |
| R4 | **Recalibration changes every quantity without touching an element** | High | C5 forbids it after submission and forces a branch. Residual: a recalibration on a long-lived `draft` is legitimate and still surprising; the residual and realised lengths are shown so it is visible |
| R5 | **The `production` fulfilment line has nowhere to go until stage 4** (X11). A configurator order can stall with no owner | High | The stall is deliberately visible: the release queue lists it, labelled "czeka na zlecenie", and stock lines ship around it. Residual: real operational drag on any configurator order containing a manufactured item, which is most of them. This is a scope boundary, not a defect, and it is the strongest argument for scheduling stage 4 next |
| R6 | **`anter_unit_cost_net` is a cost figure on a record the portal reads** | High | The portal catalogue API projects an explicit field list and this field is not in it; the configurator's unpriced and partner projections omit it; a test asserts it is absent from every portal response shape. Residual: any future portal endpoint that serialises a product wholesale would leak it — the test is the guard that fails loudly if one appears |
| R7 | **Underlay files are confidential site plans** | Medium | Non-public partition, `checkAttachmentAccess` on every read, no shareable URL, both-or-neither tenant scoping. Residual: a plan is downloadable by anyone who can open the project, which is correct but broad |
| R8 | **The custom status machine forfeits the `workflows` module's audit and retry** (C8) | Medium | `anter_submission_events` is built explicitly for the audit; notifications are declared rather than inherited. Residual: no retry semantics, and a configurable approval chain later means a migration — sized small deliberately |
| R9 | **s45's no-price catalogue changes a page the companion spec owns** (X5) | Medium | Declared in §3.16 with the default that preserves current behaviour; the priced rendering is untouched; both renderings are tested. Residual: two specs now describe one page, which is exactly why §3.16 exists in one place |
| R10 | **C6 leaves the configurator without rules**, so an impossible combination can be drawn and priced | Medium | The technical revision is the human backstop and it is mandatory in both tracks (§3.9) — this is the reason A-29 put it in both. Residual: work reaches a constructor that a rule engine would have stopped at draw time. Accepted until stage 1 |
| R11 | **`offer_number` and `submission_number` sequences under concurrency** | Low | Allocated inside the issuing command's transaction from a per-tenant sequence, never derived from a count. Numbers are never reused, including on undo |
| R12 | **Plan points are declared but labelled "wykryte"** (C12, §Deviations 1) | Low | The label changes in the implementation; the prototype needs a revision to match |

### Blast radius

`anter_configurator` adds no contract surface to `@open-mercato/*` packages — none of
`BACKWARD_COMPATIBILITY.md`'s thirteen protected categories changes. The touches outside the module
are the twelve additive items in §3.16, all in app modules owned by the companion spec, all
default-preserving, plus custom-field definitions on `catalog` products (additive, namespaced
`anter_*`) and one mutation guard registered against an `anter_orders` command.

### Rollback

Disabling `anter_configurator` in `src/modules.ts` removes both surfaces, deregisters the confirm
guard and stops the workers. Orders already placed from configurations remain orders — they carry a
dangling `configurator_revision_id`, which the companion spec's read path resolves to `null` and
renders as absent. The §3.16 columns stay and stay harmless at their defaults. No data is orphaned in
another module's tables because nothing was ever written there.

---

## 📋 Phasing

Five phases, lettered **F–J** to continue the companion spec's A–E without collision. Each is
independently shippable and each is useful on its own.

| Phase | Capability | Screens | Depends on |
|---|---|---|---|
| **F** | Geometry foundations — product geometry fields, project/revision/element model, the server-side BOM engine, admin-only inspection | — | Companion A |
| **G** | The canvas and the priced partner configurator — drawing, calibration, coverage, add-to-cart | s13 | F, companion A |
| **H** | Modes — internal mode with cost and margin, the margin-less role, the no-price account and no-price catalogue | s9, s12, s14, s45 | G, companion E (for s17's terms editing) |
| **I** | Submissions and technical review — the queue, both tracks' first step, order confirmation gating, revision invalidation | s46 (track 1) | G, companion B |
| **J** | Valuation and offers — custom items, back-office valuation, offer build/issue/accept, offer→order, CRM handoff, abandonment | s10, s11, s46 (track 2) | H, I |

F is deliberately UI-free: it makes the arithmetic that everything else depends on testable before the
hardest UI work starts (R1). H depends on the companion spec's Phase E because account type and
price-list scope are edited on the CRM partner card that phase builds.

---

## 📋 Implementation Plan

Each step leaves the application working and is verifiable by a test. Steps map onto
`om-auto-create-pr`'s execution plan; the phase is the PR boundary.

### Phase F — Geometry foundations

1. Scaffold `anter_configurator` (`index.ts`, `setup.ts`, `acl.ts`, `di.ts`, `events.ts`, `ce.ts`, `encryption.ts`, `i18n/`). Declare staff features and `defaultRoleFeatures`, portal features and `defaultCustomerRoleFeatures` (§3.14). Enable in `src/modules.ts`. `yarn generate` clean, then `yarn mercato configs cache structural --all-tenants`.
2. Product geometry custom fields in `ce.ts` (§3.3) and their section on the catalogue product form; seed values for the example products.
3. `AnterProject`, `AnterProjectRevision`, `AnterProjectElement`, `AnterPlanPoint` entities, validators, encryption map for the site address, migration.
4. `anterGeometryService` — plan units, calibration, run splitting at inserts, segment lengths (§3.4, §3.5 steps 1–2). Unit tests over fixtures including the prototype's 42.0 m → 41.4 m case.
5. `anterBomService` — modules, posts, anchors, point and insert products, `origin` classification, residuals (§3.5 steps 3–6). Fixture tests, including shared-vertex post de-duplication.
6. Batch pricing of BOM lines through `anterPartnerPricingService`; `to_quote` classification; the asserted query count.
7. `anter_configurator.revision.compute_bom` command with undo; `AnterBomLine` frozen snapshots.
8. `AnterCustomItem` entity and admin CRUD; the incompleteness flag on the revision.
9. Back-office project list and detail with the revision history and a read-only BOM table — no canvas.
10. Module-absent test: `attachments` disabled → project creation refused with the documented message, existing projects readable and computable.
11. Integration tests for Phase F.

### Phase G — Canvas and priced partner configurator

12. `PlanCanvas.tsx` — SVG viewport, underlay image, element rendering, selection, zoom and pan, design-system tokens only.
13. Drawing interactions: run, point, insert; grid snap, vertex snap, angle constraint; full keyboard operation.
14. `CalibrationDialog.tsx` and the calibration endpoint, with the post-submission lock (C5).
15. Underlay upload through `attachmentService.readUploadForm()`, preview generation, the 25 MB and type limits.
16. Client-side BOM computation sharing the server's fixture suite; `BomPanel.tsx` with optimistic update and silent reconciliation (C4, R2).
17. Plan points: declaration, coverage computation, the coverage card (§3.15).
18. Portal project list and workspace pages (s13) with `partner_priced` projection.
19. `anter_portal`: `anter_portal.cart.add_lines` bulk command with undo (X13). Then `POST /revisions/[id]/add-to-cart` — recompute, refuse unpriced configurations (§3.6), call the bulk command; the client wraps the action in `useGuardedMutation`.
20. Portal SSE wiring for revision and submission state.
21. Integration and Playwright tests for Phase G.

### Phase H — Modes

22. `anter_orders`: `account_type`, `account_owner_user_id` and `anter_partner_price_list_scope` (X1–X3) with migrations defaulting to today's behaviour.
23. `anter_orders`: s17 controls for account type and price-list scope (X4).
24. `anterConfiguratorModeService` — the four resolutions (§3.7), the `403` body with the account owner, and tests that a `preview` account holding `portal.configurator.use` is still denied.
25. Price omission (not nulling) across every projection; a test asserting no price key is present in `partner_unpriced` responses and no cost key in any portal response (R6).
26. Internal-mode workspace (s9): full catalogue, dashed out-of-price-list elements, cost and margin rows behind `anter_configurator.margin.view`.
27. The margin-less valuation view (s12) with the explicit "Niedostępne w tej roli" list and the handoff action.
28. `anter_portal`: no-price catalogue rendering and the `outside_price_list` availability value (X5, X6).
29. Portal no-price workspace (s14) with the quote-request action.
30. Integration and Playwright tests for Phase H.

### Phase I — Submissions and technical review

31. `AnterSubmission`, `AnterSubmissionComment`, `AnterSubmissionEvent` entities, numbering sequence, migration.
32. `anter_configurator.submission.create` with track derivation and due-date default; revision becomes immutable.
33. Revision branching and the supersession cascade (§3.8) — acceptance to `stale`, offers to `superseded`, open submissions to `revision_requested`.
34. The queue page (s46): KPI tiles, track explainers, state tabs, SLA counters, per-state row actions.
35. Submission detail with the read-only drawing, element-anchored comments and the internal/shared toggle.
36. The three decision commands with undo and their notifications.
37. `anter_orders`: `technical_hold` status (X8) and the confirm mutation guard registered from this module (§3.2, X10), with a module-absent test proving confirm is unconstrained without it.
38. Portal submission view and the redraw path.
39. Integration and Playwright tests for Phase I.

### Phase J — Valuation, offers and the loop back to orders

40. Custom-item creation from the workspace (s10) including the internal-only forced-variant path, and the cross-project awaiting-valuation list.
41. `anter_configurator.custom_item.price` command and the incompleteness flag lifecycle.
42. `AnterOffer` + `AnterOfferLine` entities, numbering, migration; `offer.build` via `salesCalculationService`.
43. Offer builder and issue (s11): terms text, validity, the incompleteness banner, document generation into `attachments`.
44. `anter_orders`: offer placement source and the no-re-pricing rule (X7, X9).
45. Portal offer list, detail and acceptance; order placed at frozen prices.
46. CRM subscribers for quote requests, offers and changes-requested; deal creation and stage advance (§3.12).
47. Abandonment worker with tenant-configurable thresholds and the CRM task; the two partner-card figures (X12).
48. Offer expiry worker.
49. The three-document total equality test (§3.11).
50. Integration and Playwright tests for Phase J.

---

## 🧪 Test coverage

Required in the same change as the code, per `.ai/qa/AGENTS.md`. Tests are self-contained: they
create their own partner, terms, catalogue products with geometry fields, prices and underlay in
setup and remove them in teardown; none depends on seeded demo data.

**Geometry and BOM — the fixture suite**

A shared fixture file drives both the server implementation and the client one (R2). Cases:

| Fixture | Asserts |
|---|---|
| Straight 42.0 m run, 1.8 m module, `round_down` | 23 modules, 41.4 m realised, 0.6 m residual, 24 posts, 96 anchors |
| The same with `round_up` and `nearest` | Policy is honoured and the residual sign flips |
| Run with one gate insert | Two segments, the gate's clear width removed, the gate's own posts added |
| Two runs of the same product sharing a vertex | The shared post counted once |
| Two runs of different products sharing a vertex | Posts counted per product |
| Closed loop | `postCount == moduleCount`, no `+1` |
| Run shorter than one module | Validation error, not a zero-module line |
| Point and insert products | Quantity equals placed count; posts and anchors derived |
| Recalibration on a draft | Every length scales; element geometry byte-identical |
| Client vs server | Identical output to four decimals on every fixture above |

**API paths**

| Path | Assertions |
|---|---|
| `POST /portal/projects` | Creates revision `A`; refused with a clear body when `attachments` is absent |
| `PUT /portal/revisions/[id]/calibration` | Succeeds on draft; `409 revision_locked` after submission |
| `PUT /portal/revisions/[id]/elements` | Replaces transactionally; recomputes; a client-supplied quantity is ignored (C4) |
| `GET /portal/revisions/[id]/bom` | `partner_priced` carries partner price and no cost; `partner_unpriced` carries **no price key at all**; `internal` without `margin.view` carries no cost key |
| `POST /portal/revisions/[id]/add-to-cart` | Happy path adds lines to the companion spec's cart; `409 configuration_not_orderable` with a `to_quote` line; `409 revision_superseded` on a stale revision; `403 ordering_blocked` for a blocked partner **with no reason in the body** |
| `POST /portal/revisions/[id]/quote-request` | Creates an unpriced submission; emits the CRM event; creates a deal when none is open |
| `POST /portal/offers/[id]/accept` | Places an order at frozen prices and **does not re-price**; `409 offer_expired`; `409` on the second of two concurrent accepts, with exactly one order created |
| Mode resolution | `preview` account with the feature → `403 configurator_unavailable` carrying the account owner; `hidden` → no price keys; feature absent → `403` |
| `GET /submissions` | Scoping; overdue filter; another organization's submissions invisible |
| Commands | Each undo restores the prior state field by field; `offer_number` is not released by an issue undo |
| Confirm guard | A configurator order cannot reach `confirmed` before technical acceptance; with `anter_configurator` disabled, confirm behaves exactly as the companion spec specifies |

**UI paths** (Playwright, headless)

Draw a run and see the BOM update · calibrate and see lengths change · place a gate and see the host
run split · keyboard-only element creation, nudge and delete · coverage card reflecting a deleted
element · add-to-cart landing in the companion spec's cart page · quote request confirmation ·
no-price workspace showing no prices anywhere · no-price catalogue (s45) showing Parameters instead of
prices · internal workspace showing cost and margin · the same view without `margin.view` showing the
restriction list · submissions queue tabs and SLA badges · a technical decision moving the row ·
offer issue with the incompleteness banner · offer acceptance producing an order.

**Cross-cutting**

- The three-document total equality: panel, offer, order (§3.11)
- No portal response of any shape contains `unitCostNet` or a margin field (R6)
- Site address snapshots encrypted at rest and read only through `findWithDecryption`
- One `resolveCatalogPriceBatch` per revision, asserted by query count
- Supersession cascade: a new revision staling acceptance, superseding an offer and reopening a
  submission, in one transaction

---

## 🔀 Deviations from the prototype

Recorded so the prototype and this spec do not drift silently. Each needs a prototype revision if it
is to stand.

1. **Plan points are declared, not detected** (C12). s13 and s14 label the card "Punkty wykryte
   z planu", which reads as automatic analysis of the uploaded plan. No image or CAD analysis is in
   scope. The card, its kinds and its coverage arithmetic survive unchanged; the label becomes
   "Punkty do zabezpieczenia" and the project gains a step where they are placed.
2. **A configuration containing an unpriced position cannot be added to the cart** (§3.6). The
   prototype does not show this case on s13 — its example is fully priced. The action changes to
   "Wyślij zapytanie o wycenę" and the submission takes track 2. The alternative, ordering the priced
   part, splits one drawing across two commercial documents.
3. **"Poza cennikiem" becomes two machine states** (C14): `quote_only` where no list price exists at
   all, and `outside_price_list` where a price exists but the partner's contract does not cover the
   category. s9's element 5 and s45's sliding-gate row read as one concept; they are two, with
   different remedies, and the price-list scope table (X3) is what makes the second expressible.
4. **The module-fit residual is shown.** s13's summary gives totals only; the prototype's own 42.0 m →
   41.4 m arithmetic is visible in s26 but never explained. Making the gap explicit is a change to
   what the partner sees, and it is deliberate.
5. **Technical revision gates confirmation, not placement** (C9). s13's note says the project goes to
   technical revision "po złożeniu zamówienia", which this spec implements literally — the order
   exists in `placed` throughout. s46's rows are consistent with this; the reading is made explicit
   because the opposite reading (no order until acceptance) is available in the prototype's prose.
6. **A rejected revision on a placed order produces `technical_hold`, with both exits offered**
   (§3.9). The prototype leaves A-29's tail open. The system-level behaviour is decided here; the
   commercial choice is not, and is carried to §Open questions.
7. **The internal configurator's output is a `draft` offer**, where s9's action reads "Przekaż do
   oferty" without saying what that produces. The draft is invisible to the partner until issued.
8. **2D only.** s25–s27 record the working application's 2D+3D toggle; it is not reproduced.

---

## ❓ Open questions

Carried forward, not resolved here. Each names who decides.

| # | Question | Blocks | Decider |
|---|---|---|---|
| Q1 | When a constructor rejects a revision after a priced order exists, who absorbs the cost of the redraw or the cancellation? The mechanism is built (§3.9); the commercial rule is not | Nothing technically; it is a policy the `technical_hold` screen should state | Sales, with the product owner. The prototype's A-29 tail |
| Q2 | What are the abandonment thresholds? Defaults of 14 days and 10 000 are placeholders, configurable and documented as such (§3.12) | Nothing; the worker ships with defaults | Sales (the prototype's A-5) |
| Q3 | Does `module_fit_policy` default correctly at `round_down` for every product family, or do some families over-deliver by convention? | Nothing; it is a per-product field | Production and sales, per family |
| Q4 | Should the technical comment thread be visible to the partner in full, or only the decision? This spec shows the `shared` thread (following the working application) | Nothing | Product owner. Reversible — it is a projection |
| Q5 | Are transport and installation priced inside the configurator, or quoted separately? The offer carries a `shipping` line; installation has no representation | Phase J's offer shape if installation must be a line | The source document flags this as open (§Logistyka) |
| Q6 | When stage 1 delivers first-class product geometry authoring, do the `anter_*` custom fields migrate into it or stay? | Nothing now; C11 is designed so either is a data migration | IT, when stage 1 is specified |

---

## 📓 Changelog

### Created — 2026-09-19
Initial specification. Written as the companion to
[`2026-09-19-anter-catalogue-ordering-end-to-end.md`](./2026-09-19-anter-catalogue-ordering-end-to-end.md)
and deliberately restating none of it: §"Relationship to the catalogue spec" maps every reused
capability to its owner, and §3.16 lists in one place the twelve additive changes this spec makes to
surfaces that spec owns, each with its default-preserving migration.

Scope and approach fixed by the product owner in session: the configurator is **built natively**
(C1), and the surface is the **full flow across both portal and back office** (s9–s14, s45, s46),
ending where an order exists and the catalogue spec's pipeline takes over. Production orders remain
out of scope in both specs; X11 states the interim behaviour of a `production` line explicitly rather
than leaving it to be discovered.
