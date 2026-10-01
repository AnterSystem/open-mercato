# anter_demo

Reproducible demo dataset for the Anter ordering flow. Loading it gives you a
working end-to-end environment: the full product catalogue, the partner company
and its contacts, a portal login, and partner terms, stock, orders, shipments
and invoices that reference those products.

## Running it

```bash
# Everything, into one organization
yarn mercato anter_demo seed --tenant <tenantId> --org <organizationId>

# Just one or more sections
yarn mercato anter_demo seed --tenant <t> --org <o> --only catalog,geometry

# Faster run without product photos
yarn mercato anter_demo seed --tenant <t> --org <o> --images false

# Portal logins get this password (default: "secret")
yarn mercato anter_demo seed --tenant <t> --org <o> --portal-password 'S0me!Pass'
```

`yarn initialize` picks the module up automatically through `setup.ts`
(`seedExamples`), so a fresh install is seeded without any extra step. Pass
`--no-examples` to `mercato init` to skip it.

In Docker, prefix with the exec bridge: `node scripts/docker-exec.mjs mercato
anter_demo seed …`.

**The seed is idempotent.** Every section checks for an existing record before
creating one, so re-running it reports skips instead of duplicating data. A
fresh organization takes roughly 15 seconds.

## What lands

| Section | Contents |
|---------|----------|
| `catalog` | 22 categories, 194 products (60 configurable), 258 variants, 392 price rows, 80 product photos |
| `geometry` | the `anter_geometry` product fieldset, a post and an anchor product, and configurator geometry on 7 drawable products |
| `customers` | 1 partner company + 9 contacts, linked |
| `portal-users` | 1 portal login, tied to the company and its contact, with `portal_admin` + `buyer` roles |
| `anter` | partner terms, 202 stock items, 6 orders + 10 lines, 10 stock allocations, 3 shipments + 5 shipment lines, 2 invoices, the order-number sequence |
| `configurator` | 1 project + revision (with its site-plan underlay) and the project-number sequence |
| `carts` | the portal user's active cart and its line |

## Fixtures

Everything loads from `seed/*.json`. They are plain data, reviewable in a diff:

- `catalog.json` — generated from the source spreadsheet, see below
- `configurator-geometry.json` — drawing kind, module length, post/anchor SKUs per product SKU
- `customers.json` — companies and people, keyed by `ref` (domain / email)
- `portal-users.json` — logins, referencing companies and people by `ref`
- `anter.json` — partner terms, stock, orders, allocations, shipments, invoices, the portal cart and the configurator project
- `media/` — files the seed uploads as attachments (currently the configurator site plan)

Fixtures never contain UUIDs of records the seed itself creates. Products are
referenced by **SKU**, companies and people by **ref**, orders by **order
number**, order lines by **(order number, line number)**, stock by **(product
SKU, variant SKU)** and project revisions by **(project number, revision
label)**. That is what makes the dataset portable across databases.

### Catalog fixture and product photos

`seed/catalog.json` is generated from the committed workbook at
`.ai/docs/lista produktow nazwy 2026-09.xlsx`. Regenerate it after the product
list changes, then review the diff:

```bash
yarn mercato anter_demo build-catalog-fixture
```

Product **photos** are not copied into the fixture — they are embedded in the
workbook as Excel "rich values", and the seed reads them straight out of it at
load time via `lib/xlsx.ts` (a small zip/XML reader built on `node:zlib`, no new
dependency). If the workbook is not present the catalogue still seeds, just
without pictures, and a warning is logged. Point at a copy with `--workbook
<path>` when the app ships without the `.ai/` directory.

### Configurator geometry

`seed/configurator-geometry.json` is what makes the configurator usable: without
it every product reports `anter_drawing_kind = 'none'` and no drawing can become
a bill of materials. It is deliberately a separate fixture because
`catalog.json` is regenerated from the workbook, which carries no geometry
columns.

It also creates the post and anchor products the catalogue lacks — the BOM
engine only emits post and anchor lines when those SKUs resolve to a real
product — and it re-ensures the `anter_geometry` fieldset so the fields are
editable on the product form of an already-initialised tenant.

The line products use a 1.8 m module so the spec's worked example reproduces in
the UI: a 42.0 m run becomes 23 modules, 41.4 m realised, 0.6 m residual, 24
posts and 96 anchors.

## Notes on the data

- **Prices are indicative, not a price list.** The source spreadsheet carries no
  pricing, so `buildCatalogFixture.ts` derives a figure per category scaled by
  length, height and diameter. The magnitudes were originally calibrated in USD
  and were relabelled to PLN, so they read low for the Polish market — rescale
  `CATEGORY_BASE_PRICE` when real pricing exists.
- **Everything is PLN at 23% VAT** — catalogue, orders, invoices and the portal
  cart — matching the instance's base currency.
- **Prerequisites are bootstrapped, not assumed.** `mercato init` runs the core
  modules' `seedDefaults` first (currencies, VAT rates, price kinds, sales
  channels, customer roles), but the standalone CLI can be pointed at a bare
  organization, so the seed creates the catalog price kinds and sales VAT rates
  itself when they are missing. Both core seeders are idempotent.
- **Products link to the 23% VAT rate** rather than only carrying the scalar, so
  the admin UI shows a configured tax rate.
- **Orders are written as settled records** rather than replayed through
  `anter_orders.order.place`. The fixture already holds final numbers, statuses
  and timestamps; the place command would recompute them from a cart that no
  longer exists.
- **The order sequence is never rewound.** If the target organization is already
  further along than the fixture, its numbering is left alone so existing order
  numbers cannot be reissued.
- Customer names and emails are **encrypted at rest**, so the seed matches
  existing records by decrypting them and comparing in memory rather than
  filtering on the column.

## Known gaps

- The configurator fixture is deliberately thin: one project and one revision
  with its underlay, no elements, BOM lines, submissions or offers. That module
  was still being built when this snapshot was taken.
- There are no customer addresses; the live instance had none.

## Regenerating from a live instance

The customer, portal and Anter fixtures were captured from a running instance.
There is no automated re-capture command — if the demo data changes and you want
to re-snapshot it, export through the admin API (which decrypts PII) and the
`anter_*` tables, replacing the UUIDs with the `ref` / SKU / order-number keys
described above.
