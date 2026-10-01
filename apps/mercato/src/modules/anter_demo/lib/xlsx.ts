import { inflateRawSync } from 'node:zlib'

export type XlsxArchive = {
  files: Map<string, Buffer>
  read: (name: string) => Buffer | null
  readText: (name: string) => string | null
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const STORED = 0
const DEFLATED = 8

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 0xffff - 22)
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset
  }
  throw new Error('[internal] not a zip archive: end of central directory not found')
}

/**
 * Minimal zip reader so the seed can pull product photos straight out of the
 * committed spreadsheet without adding an xlsx dependency to the app.
 * Handles the two methods Excel emits: stored and deflate.
 */
export function openXlsx(buffer: Buffer): XlsxArchive {
  const eocd = findEndOfCentralDirectory(buffer)
  const entryCount = buffer.readUInt16LE(eocd + 10)
  let cursor = buffer.readUInt32LE(eocd + 16)

  const files = new Map<string, Buffer>()
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) break
    const compressionMethod = buffer.readUInt16LE(cursor + 10)
    const compressedSize = buffer.readUInt32LE(cursor + 20)
    const nameLength = buffer.readUInt16LE(cursor + 28)
    const extraLength = buffer.readUInt16LE(cursor + 30)
    const commentLength = buffer.readUInt16LE(cursor + 32)
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42)
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26)
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const raw = buffer.subarray(dataStart, dataStart + compressedSize)

    if (compressionMethod === STORED) files.set(name, Buffer.from(raw))
    else if (compressionMethod === DEFLATED) files.set(name, inflateRawSync(raw))

    cursor += 46 + nameLength + extraLength + commentLength
  }

  return {
    files,
    read: (name) => files.get(name) ?? null,
    readText: (name) => files.get(name)?.toString('utf8') ?? null,
  }
}

const XML_ENTITIES: Record<string, string> = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&amp;': '&',
}

export function decodeXmlText(value: string): string {
  return value.replace(/&(?:lt|gt|quot|apos|amp);/g, (match) => XML_ENTITIES[match] ?? match)
}

export function columnToIndex(column: string): number {
  let index = 0
  for (const character of column) index = index * 26 + (character.charCodeAt(0) - 64)
  return index
}

export function indexToColumn(index: number): string {
  let column = ''
  let remaining = index
  while (remaining > 0) {
    const rest = (remaining - 1) % 26
    column = String.fromCharCode(65 + rest) + column
    remaining = (remaining - rest - 1) / 26
  }
  return column
}

export type SheetCell = { value: string; valueMetadataIndex: string | null }
export type SheetRows = Record<number, Record<string, SheetCell>>

export type ParsedSheet = {
  rows: SheetRows
  merges: Array<[string, string]>
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const strings: string[] = []
  for (const item of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let text = ''
    for (const fragment of item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) text += fragment[1]
    strings.push(decodeXmlText(text))
  }
  return strings
}

/** Reads a worksheet into a row/column map, keeping merge ranges for later expansion. */
export function parseSheet(archive: XlsxArchive, sheetPath = 'xl/worksheets/sheet1.xml'): ParsedSheet {
  const sharedStrings = parseSharedStrings(archive.readText('xl/sharedStrings.xml'))
  const xml = archive.readText(sheetPath)
  if (!xml) throw new Error(`[internal] worksheet ${sheetPath} not found in archive`)

  const rows: SheetRows = {}
  for (const rowMatch of xml.matchAll(/<row ([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1])
    if (!rowNumber) continue
    const cells: Record<string, SheetCell> = {}
    for (const cellMatch of (rowMatch[2] ?? '').matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = cellMatch[1]
      const inner = cellMatch[2] ?? ''
      const column = /\br="([A-Z]+)\d+"/.exec(attributes)?.[1]
      if (!column) continue
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const valueMetadataIndex = /\bvm="(\d+)"/.exec(attributes)?.[1] ?? null

      let value = ''
      if (type === 'inlineStr') {
        for (const fragment of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) value += decodeXmlText(fragment[1])
      } else {
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
        if (raw != null) value = type === 's' ? (sharedStrings[Number(raw)] ?? '') : decodeXmlText(raw)
      }
      if (value !== '' || valueMetadataIndex) cells[column] = { value, valueMetadataIndex }
    }
    rows[rowNumber] = cells
  }

  const merges = [...xml.matchAll(/<mergeCell ref="([A-Z]+\d+):([A-Z]+\d+)"\/>/g)].map(
    (match) => [match[1], match[2]] as [string, string],
  )

  return { rows, merges }
}

/**
 * Excel stores a merged value only in the top-left cell; copy it across the
 * range. The rich-value anchor is deliberately NOT copied — an embedded photo
 * belongs to the single cell that owns it, and propagating the anchor would
 * bleed one product's picture across every row the merge happens to span.
 */
export function expandMerges({ rows, merges }: ParsedSheet): SheetRows {
  for (const [start, end] of merges) {
    const from = /([A-Z]+)(\d+)/.exec(start)
    const to = /([A-Z]+)(\d+)/.exec(end)
    if (!from || !to) continue
    const source = rows[Number(from[2])]?.[from[1]]
    if (!source) continue
    const shared: SheetCell = { value: source.value, valueMetadataIndex: null }
    for (let row = Number(from[2]); row <= Number(to[2]); row += 1) {
      rows[row] = rows[row] ?? {}
      for (let column = columnToIndex(from[1]); column <= columnToIndex(to[1]); column += 1) {
        const key = indexToColumn(column)
        if (rows[row][key] == null) rows[row][key] = row === Number(from[2]) ? source : shared
      }
    }
  }
  return rows
}

export type RichValueImage = { file: string; caption: string | null }

/**
 * Photos pasted as Excel "rich values" live behind a four-hop indirection:
 * cell `vm=` -> valueMetadata -> futureMetadata rvb -> rich value -> rel -> media file.
 */
export function readRichValueImages(archive: XlsxArchive): Map<string, RichValueImage> {
  const result = new Map<string, RichValueImage>()
  const metadata = archive.readText('xl/metadata.xml')
  const richValues = archive.readText('xl/richData/rdrichvalue.xml')
  const richValueRels = archive.readText('xl/richData/richValueRel.xml')
  const relationships = archive.readText('xl/richData/_rels/richValueRel.xml.rels')
  if (!metadata || !richValues || !richValueRels || !relationships) return result

  const valueMetadata = /<valueMetadata[^>]*>([\s\S]*?)<\/valueMetadata>/.exec(metadata)?.[1]
  const futureMetadata = /<futureMetadata name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/.exec(metadata)?.[1]
  if (!valueMetadata || !futureMetadata) return result

  const blockIndexes = [...valueMetadata.matchAll(/<bk><rc t="(\d+)" v="(\d+)"\/><\/bk>/g)].map((match) =>
    Number(match[2]),
  )
  const richValueIndexes = [...futureMetadata.matchAll(/<xlrd:rvb i="(\d+)"\/>/g)].map((match) => Number(match[1]))
  const values = [...richValues.matchAll(/<rv [^>]*>([\s\S]*?)<\/rv>/g)].map((match) =>
    [...match[1].matchAll(/<v>([\s\S]*?)<\/v>/g)].map((entry) => entry[1]),
  )
  const relationIds = [...richValueRels.matchAll(/<rel r:id="([^"]+)"\/>/g)].map((match) => match[1])
  const targets = new Map<string, string>()
  for (const match of relationships.matchAll(/<Relationship Id="([^"]+)"[^>]*Target="([^"]+)"/g)) {
    targets.set(match[1], `xl/${match[2].replace(/^\.\.\//, '')}`)
  }

  blockIndexes.forEach((futureIndex, position) => {
    const value = values[richValueIndexes[futureIndex]]
    if (!value) return
    const target = targets.get(relationIds[Number(value[0])] ?? '')
    if (!target) return
    result.set(String(position + 1), { file: target, caption: value[2] ? decodeXmlText(value[2]) : null })
  })

  return result
}
