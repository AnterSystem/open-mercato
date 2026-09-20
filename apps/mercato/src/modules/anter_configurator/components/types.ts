export type Vertex = [number, number]

export type ElementGeometry = { vertices?: Vertex[]; position?: Vertex; rotation?: number }

export type ElementDraft = {
  id: string
  elementKind: 'run' | 'point' | 'insert' | 'annotation'
  productId: string | null
  productVariantId: string | null
  geometry: ElementGeometry
  hostElementId?: string | null
  hostOffsetRatio?: number | null
  label?: string | null
  sortOrder: number
}

export type ProductOption = {
  id: string
  title: string
  drawingKind: 'line' | 'point' | 'insert' | 'none'
}
