import { expandMerges, openXlsx, parseSheet, readRichValueImages } from './xlsx'
import type {
  CatalogCategoryFixture,
  CatalogFixture,
  CatalogProductFixture,
  CatalogVariantFixture,
} from './types'

export const SOURCE_WORKBOOK = '.ai/docs/lista produktow nazwy 2026-09.xlsx'
export const CATALOG_CURRENCY = 'PLN'
export const CATALOG_TAX_RATE = 23

const COLUMNS = {
  A: 'category',
  B: 'subcategory',
  C: 'namePrefix',
  D: 'name',
  F: 'productName',
  G: 'bollardDiameter',
  H: 'profileDiameter',
  I: 'externalAnchors',
  J: 'externalBasePlate',
  K: 'internalAnchors',
  L: 'height',
  M: 'length',
} as const

type SheetRecord = {
  row: number
  category?: string
  subcategory?: string
  namePrefix?: string
  name?: string
  productName?: string
  bollardDiameter?: string
  profileDiameter?: string
  externalAnchors?: string
  externalBasePlate?: string
  internalAnchors?: string
  height?: string
  length?: string
  pictureKey?: string
}

type AttributeKey = keyof Pick<
  SheetRecord,
  | 'length'
  | 'height'
  | 'bollardDiameter'
  | 'profileDiameter'
  | 'externalAnchors'
  | 'externalBasePlate'
  | 'internalAnchors'
>

const VARIANT_ATTRIBUTES: Array<{ key: AttributeKey; label: string }> = [
  { key: 'length', label: 'Length' },
  { key: 'height', label: 'Height (mm)' },
  { key: 'bollardDiameter', label: 'Bollard diameter (mm)' },
  { key: 'profileDiameter', label: 'Profile diameter (mm)' },
  { key: 'externalAnchors', label: 'External anchors' },
  { key: 'externalBasePlate', label: 'External base plate' },
  { key: 'internalAnchors', label: 'Internal anchors' },
]

const SPEC_LABELS: Partial<Record<AttributeKey, string>> = {
  bollardDiameter: 'Bollard diameter',
  profileDiameter: 'Profile diameter',
  externalAnchors: 'External anchors',
  externalBasePlate: 'External base plate',
  internalAnchors: 'Internal anchors',
  height: 'Height',
}

const SPEC_ORDER: AttributeKey[] = [
  'bollardDiameter',
  'profileDiameter',
  'height',
  'externalAnchors',
  'externalBasePlate',
  'internalAnchors',
]

const IDENTITY_COLUMNS: Array<keyof SheetRecord> = [
  'productName',
  'bollardDiameter',
  'profileDiameter',
  'externalAnchors',
  'externalBasePlate',
  'internalAnchors',
  'height',
  'length',
]

/** Placeholder the source sheet uses where a dimension does not apply. */
const NOT_APPLICABLE = 'X'

const POLISH_LETTERS: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (character) => POLISH_LETTERS[character] ?? character)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
}

/**
 * Indicative list prices in PLN — the source spreadsheet carries no pricing, so
 * the demo derives a figure per category and scales it by the physical size of
 * the item. These are demo magnitudes, not a real price list.
 */
const CATEGORY_BASE_PRICE: Record<string, number> = {
  'High Impact Barriers (A, B)': 1250,
  'Pedestrian Safety Barriers (P)': 640,
  'Safety Gates (P, B)': 820,
  'Kerb* Barriers (P, A, B, R)': 430,
  'Rack Protection (R, A)': 260,
  'Flexible Safety Bollards (P, A, B, D)': 310,
  'Height restrictors (B, D)': 980,
  'High Barriers (A, R)': 1420,
  'Column Protection (B)': 215,
  'Wall & Corner Protection(B)': 165,
  'Dock & trailer equipment (D)': 1560,
  'Smart safety solutions': 2100,
  Accessories: 85,
  'Produkty łączone': 1480,
}
const FALLBACK_BASE_PRICE = 500

function firstNumber(value: string | undefined): number | null {
  const match = /(\d+(?:[.,]\d+)?)/.exec(value ?? '')
  return match ? Number.parseFloat(match[1].replace(',', '.')) : null
}

function priceFor(category: string | undefined, record: SheetRecord): number {
  const base = CATEGORY_BASE_PRICE[category ?? ''] ?? FALLBACK_BASE_PRICE
  const length = firstNumber(record.length)
  const height = firstNumber(record.height)
  const diameter = firstNumber(record.bollardDiameter)
  let price = base
  if (length) price *= 0.55 + 0.45 * (length / 1000)
  if (height) price *= 0.85 + 0.15 * (height / 1100)
  if (diameter) price *= 0.88 + 0.12 * (diameter / 159)
  return Math.round(price / 5) * 5
}

function lengthFromName(name: string | undefined): string | null {
  const match = /(\d{3,5})\s*mm\s*$/i.exec(name ?? '')
  return match ? `${match[1]} mm` : null
}

function readRecords(workbook: Buffer): SheetRecord[] {
  const archive = openXlsx(workbook)
  const rows = expandMerges(parseSheet(archive))
  const images = readRichValueImages(archive)

  const records: SheetRecord[] = []
  const rowNumbers = Object.keys(rows)
    .map(Number)
    .filter((row) => row >= 3)
    .sort((left, right) => left - right)

  for (const row of rowNumbers) {
    const cells = rows[row]
    const record: SheetRecord = { row }
    for (const [column, field] of Object.entries(COLUMNS)) {
      const cell = cells[column]
      if (cell?.value) (record as Record<string, unknown>)[field] = cell.value.trim()
    }
    const pictureIndex = cells.E?.valueMetadataIndex
    if (pictureIndex && images.has(pictureIndex)) record.pictureKey = pictureIndex
    if (!record.name && !record.productName) continue
    records.push(record)
  }

  // The category merge range stops short of the trailing combined-products
  // block, so the last rows inherit the category above them.
  let lastCategory: string | undefined
  for (const record of records) {
    if (record.category) lastCategory = record.category
    else record.category = lastCategory
  }

  // Some rows carry their length only inside the legacy product name.
  for (const record of records) {
    if (record.length) continue
    const derived = lengthFromName(record.productName)
    if (derived) record.length = derived
  }

  return records
}

function buildCategories(records: SheetRecord[]): CatalogCategoryFixture[] {
  const categories = new Map<string, CatalogCategoryFixture>()
  for (const record of records) {
    const category = record.category
    if (!category) continue
    if (!categories.has(category)) {
      categories.set(category, { key: category, name: category, slug: slugify(category), parentKey: null })
    }
    if (record.subcategory) {
      const key = `${category} / ${record.subcategory}`
      if (!categories.has(key)) {
        categories.set(key, {
          key,
          name: record.subcategory,
          slug: slugify(`${category}-${record.subcategory}`),
          parentKey: category,
        })
      }
    }
  }
  return [...categories.values()]
}

function uniqueValues(records: SheetRecord[], key: AttributeKey): string[] {
  return [...new Set(records.map((record) => record[key]).filter((value): value is string => Boolean(value)))]
}

export function buildCatalogFixture(workbook: Buffer, images: Map<string, { file: string; caption: string | null }>): CatalogFixture {
  const records = readRecords(workbook)
  const categories = buildCategories(records)

  const groups = new Map<string, SheetRecord[]>()
  for (const record of records) {
    const key = [record.category ?? '', record.subcategory ?? '', record.name ?? record.productName ?? ''].join('||')
    const bucket = groups.get(key)
    if (bucket) bucket.push(record)
    else groups.set(key, [record])
  }

  const usedHandles = new Set<string>()
  const usedSkus = new Set<string>()
  const claim = (taken: Set<string>, candidate: string) => {
    let value = candidate || 'item'
    let counter = 2
    while (taken.has(value)) {
      value = `${candidate}-${counter}`
      counter += 1
    }
    taken.add(value)
    return value
  }

  const products: CatalogProductFixture[] = []
  for (const rows of groups.values()) {
    // Rows that repeat with no distinguishing data are duplicates, not variants.
    const seen = new Set<string>()
    const distinct = rows.filter((record) => {
      const signature = IDENTITY_COLUMNS.map((column) => record[column] ?? '').join('|')
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    })

    const head = distinct[0]
    const category = head.category ?? ''
    const categoryKey = head.subcategory ? `${category} / ${head.subcategory}` : category
    const varying = VARIANT_ATTRIBUTES.filter(({ key }) => uniqueValues(distinct, key).length > 1)
    const isConfigurable = distinct.length > 1 && varying.length > 0
    const title = head.name ?? head.productName ?? 'Product'

    const handle = claim(usedHandles, slugify(`${category}-${title}`))
    const sku = claim(usedSkus, slugify(title).toUpperCase())

    const specs: string[] = []
    const metadata: Record<string, unknown> = {
      source: SOURCE_WORKBOOK,
      sheetRows: rows.map((record) => record.row),
      category,
    }
    if (head.subcategory) metadata.subcategory = head.subcategory
    if (head.namePrefix) metadata.namePrefix = head.namePrefix

    for (const key of SPEC_ORDER) {
      const values = uniqueValues(distinct, key)
      if (values.length !== 1 || values[0] === NOT_APPLICABLE) continue
      metadata[key] = values[0]
      specs.push(`${SPEC_LABELS[key] ?? key}: ${values[0]}`)
    }

    const legacyNames = [...new Set(distinct.map((record) => record.productName).filter(Boolean))] as string[]
    if (legacyNames.length) metadata.legacyProductNames = legacyNames

    const lengths = uniqueValues(distinct, 'length')
    const kind = head.namePrefix ?? category.replace(/\s*\([^)]*\)\s*$/, '')
    const range = category.replace(/\s*\([^)]*\)\s*$/, '').trim()
    let description = `${title} — ${kind} from the ${range} range.`
    if (lengths.length > 1) description += ` Available in ${lengths.length} lengths: ${lengths.join(', ')}.`
    if (specs.length) description += ` ${specs.join('. ')}.`

    const pictureRow = rows.find((record) => record.pictureKey)
    const image = pictureRow?.pictureKey ? images.get(pictureRow.pictureKey) ?? null : null

    const variants: CatalogVariantFixture[] = []
    let optionSchema: CatalogProductFixture['optionSchema'] = null

    if (isConfigurable) {
      optionSchema = {
        name: `${title} options`,
        options: varying.map(({ key, label }) => ({
          code: slugify(key),
          label,
          inputType: 'select' as const,
          isRequired: true,
          choices: uniqueValues(distinct, key).map((value) => ({ code: slugify(value) || 'na', label: value })),
        })),
      }
      distinct.forEach((record, index) => {
        const optionValues: Record<string, string> = {}
        for (const { key } of varying) {
          const value = record[key]
          if (value) optionValues[slugify(key)] = value
        }
        const label = varying.map(({ key }) => record[key]).filter(Boolean).join(' / ')
        const length = firstNumber(record.length)
        const height = firstNumber(record.height)
        const variantMetadata: Record<string, unknown> = { sheetRow: record.row }
        if (record.productName) variantMetadata.legacyProductName = record.productName
        variants.push({
          name: record.productName ?? `${title} ${label}`.trim(),
          sku: claim(usedSkus, `${sku}-${slugify(label) || `v${index + 1}`}`.toUpperCase()),
          optionValues,
          isDefault: index === 0,
          price: priceFor(category, record),
          ...(length || height
            ? { dimensions: { ...(length ? { width: length } : {}), ...(height ? { height } : {}), unit: 'mm' } }
            : {}),
          metadata: variantMetadata,
        })
      })
    }

    products.push({
      handle,
      sku,
      title,
      ...(head.namePrefix ? { subtitle: head.namePrefix } : {}),
      description: description.slice(0, 4000),
      categoryKey,
      isConfigurable,
      price: priceFor(category, head),
      metadata,
      image,
      optionSchema,
      variants,
    })
  }

  return {
    source: SOURCE_WORKBOOK,
    currencyCode: CATALOG_CURRENCY,
    taxRate: CATALOG_TAX_RATE,
    categories,
    products,
  }
}

export function readCatalogFixtureFromWorkbook(workbook: Buffer): CatalogFixture {
  return buildCatalogFixture(workbook, readRichValueImages(openXlsx(workbook)))
}
