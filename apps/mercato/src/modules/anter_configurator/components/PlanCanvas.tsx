"use client"

import * as React from 'react'
import { MousePointer2, Minus, Circle, DoorOpen, ZoomIn, ZoomOut, Magnet, Ruler, Trash2 } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { ElementDraft, Vertex } from './types'

/**
 * The one component with no precedent in `packages/ui` (spec §UI/UX "The
 * plan canvas"): SVG, not `<canvas>`, so every element is individually
 * selectable and styleable with design-system tokens. Owns no data fetching
 * — the workspace page fetches server-side and passes elements as props.
 *
 * Keyboard: Tab/Shift+Tab cycles the selection, arrows nudge the selected
 * element by one grid step, Escape cancels an in-progress run, Enter closes
 * it, Delete removes the selection. Selection is tracked as an index rather
 * than native per-shape DOM focus — SVG focus/ARIA semantics are too
 * inconsistent across browsers to build the primary interaction on.
 */

export type PlanCanvasTool = 'select' | 'run' | 'point' | 'insert'

export type PlanCanvasProps = {
  elements: ElementDraft[]
  onElementsChange: (elements: ElementDraft[]) => void
  underlayUrl?: string | null
  underlayWidthUnits?: number | null
  underlayHeightUnits?: number | null
  gridSizeM: number
  metresPerUnit: number | null
  activeProductId: string | null
  selectedElementId: string | null
  onSelectedElementChange: (id: string | null) => void
  readOnly?: boolean
}

const DEFAULT_VIEW_SIZE = 1000

function createId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `tmp-${Math.random().toString(36).slice(2)}`
}

function projectPointOntoSegment(point: Vertex, a: Vertex, b: Vertex): number {
  const abx = b[0] - a[0]
  const aby = b[1] - a[1]
  const lengthSquared = abx * abx + aby * aby
  if (lengthSquared === 0) return 0
  const t = ((point[0] - a[0]) * abx + (point[1] - a[1]) * aby) / lengthSquared
  return Math.max(0, Math.min(1, t))
}

function findNearestRun(
  elements: ElementDraft[],
  point: Vertex,
): { element: ElementDraft; projectedPoint: Vertex; offsetRatio: number } | null {
  let best: { element: ElementDraft; projectedPoint: Vertex; offsetRatio: number; distance: number } | null = null
  for (const element of elements) {
    const vertices = element.geometry.vertices
    if (element.elementKind !== 'run' || !vertices || vertices.length < 2) continue

    const segmentLengths = vertices.slice(1).map((vertex, index) => Math.hypot(vertex[0] - vertices[index][0], vertex[1] - vertices[index][1]))
    const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0)

    let cursor = 0
    for (let i = 1; i < vertices.length; i++) {
      const a = vertices[i - 1]
      const b = vertices[i]
      const segmentLength = segmentLengths[i - 1]
      const t = projectPointOntoSegment(point, a, b)
      const projected: Vertex = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
      const distance = Math.hypot(point[0] - projected[0], point[1] - projected[1])
      const offsetRatio = totalLength > 0 ? (cursor + segmentLength * t) / totalLength : 0
      if (!best || distance < best.distance) {
        best = { element, projectedPoint: projected, offsetRatio, distance }
      }
      cursor += segmentLength
    }
  }
  return best
}

export function PlanCanvas(props: PlanCanvasProps) {
  const t = useT()
  const svgRef = React.useRef<SVGSVGElement>(null)
  const [tool, setTool] = React.useState<PlanCanvasTool>('select')
  const [draftVertices, setDraftVertices] = React.useState<Vertex[]>([])
  const [gridSnap, setGridSnap] = React.useState(true)
  const [angleSnap, setAngleSnap] = React.useState(false)
  const [viewBox, setViewBox] = React.useState({
    x: 0,
    y: 0,
    width: props.underlayWidthUnits ?? DEFAULT_VIEW_SIZE,
    height: props.underlayHeightUnits ?? DEFAULT_VIEW_SIZE,
  })

  const dimensionsAppliedRef = React.useRef(false)
  React.useEffect(() => {
    if (dimensionsAppliedRef.current) return
    if (props.underlayWidthUnits && props.underlayHeightUnits) {
      dimensionsAppliedRef.current = true
      setViewBox({ x: 0, y: 0, width: props.underlayWidthUnits, height: props.underlayHeightUnits })
    }
  }, [props.underlayWidthUnits, props.underlayHeightUnits])

  const gridSizeUnits = props.metresPerUnit ? props.gridSizeM / props.metresPerUnit : null

  const snapVertex = React.useCallback((vertex: Vertex): Vertex => {
    if (!gridSnap || !gridSizeUnits) return vertex
    return [Math.round(vertex[0] / gridSizeUnits) * gridSizeUnits, Math.round(vertex[1] / gridSizeUnits) * gridSizeUnits]
  }, [gridSnap, gridSizeUnits])

  const applyAngleSnap = React.useCallback((from: Vertex, to: Vertex): Vertex => {
    if (!angleSnap) return to
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const length = Math.hypot(dx, dy)
    if (length === 0) return to
    const step = Math.PI / 4
    const snappedAngle = Math.round(Math.atan2(dy, dx) / step) * step
    return [from[0] + Math.cos(snappedAngle) * length, from[1] + Math.sin(snappedAngle) * length]
  }, [angleSnap])

  function toSvgPoint(clientX: number, clientY: number): Vertex | null {
    const svg = svgRef.current
    if (!svg) return null
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const transformed = point.matrixTransform(ctm.inverse())
    return [transformed.x, transformed.y]
  }

  const selected = props.elements.find((element) => element.id === props.selectedElementId) ?? null

  function finishRun() {
    if (draftVertices.length >= 2 && props.activeProductId) {
      const element: ElementDraft = {
        id: createId(),
        elementKind: 'run',
        productId: props.activeProductId,
        productVariantId: null,
        geometry: { vertices: draftVertices },
        sortOrder: props.elements.length,
      }
      props.onElementsChange([...props.elements, element])
    }
    setDraftVertices([])
  }

  function handleCanvasClick(event: React.MouseEvent<SVGSVGElement>) {
    if (props.readOnly) return
    const point = toSvgPoint(event.clientX, event.clientY)
    if (!point) return

    if (tool === 'select') {
      props.onSelectedElementChange(null)
      return
    }
    if (!props.activeProductId) return

    if (tool === 'point') {
      const element: ElementDraft = {
        id: createId(),
        elementKind: 'point',
        productId: props.activeProductId,
        productVariantId: null,
        geometry: { position: snapVertex(point) },
        sortOrder: props.elements.length,
      }
      props.onElementsChange([...props.elements, element])
      return
    }

    if (tool === 'run') {
      const previous = draftVertices[draftVertices.length - 1]
      const next = previous ? applyAngleSnap(previous, snapVertex(point)) : snapVertex(point)
      setDraftVertices((prev) => [...prev, next])
      return
    }

    if (tool === 'insert') {
      const host = findNearestRun(props.elements, point)
      if (!host) return
      const element: ElementDraft = {
        id: createId(),
        elementKind: 'insert',
        productId: props.activeProductId,
        productVariantId: null,
        geometry: { position: host.projectedPoint },
        hostElementId: host.element.id,
        hostOffsetRatio: host.offsetRatio,
        sortOrder: props.elements.length,
      }
      props.onElementsChange([...props.elements, element])
    }
  }

  function removeSelected() {
    if (!selected) return
    props.onElementsChange(props.elements.filter((element) => element.id !== selected.id && element.hostElementId !== selected.id))
    props.onSelectedElementChange(null)
  }

  function selectRelative(step: number) {
    if (!props.elements.length) return
    const currentIndex = props.elements.findIndex((element) => element.id === props.selectedElementId)
    const nextIndex = ((currentIndex === -1 ? 0 : currentIndex + step) + props.elements.length) % props.elements.length
    props.onSelectedElementChange(props.elements[nextIndex].id)
  }

  function nudgeSelected(dx: number, dy: number) {
    if (!selected) return
    const step = gridSizeUnits ?? 1
    props.onElementsChange(props.elements.map((element) => {
      if (element.id !== selected.id) return element
      if (element.geometry.vertices) {
        return { ...element, geometry: { vertices: element.geometry.vertices.map(([x, y]) => [x + dx * step, y + dy * step] as Vertex) } }
      }
      if (element.geometry.position) {
        return { ...element, geometry: { position: [element.geometry.position[0] + dx * step, element.geometry.position[1] + dy * step] as Vertex } }
      }
      return element
    }))
  }

  const arrowDeltas: Record<string, Vertex> = {
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
  }

  function handleKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (props.readOnly) return
    if (event.key === 'Escape') {
      setDraftVertices([])
      return
    }
    if (event.key === 'Enter' && tool === 'run') {
      finishRun()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      selectRelative(event.shiftKey ? -1 : 1)
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selected) {
      event.preventDefault()
      removeSelected()
      return
    }
    const delta = arrowDeltas[event.key]
    if (delta && selected) {
      event.preventDefault()
      nudgeSelected(delta[0], delta[1])
    }
  }

  function zoom(factor: number) {
    setViewBox((prev) => {
      const centerX = prev.x + prev.width / 2
      const centerY = prev.y + prev.height / 2
      const width = prev.width * factor
      const height = prev.height * factor
      return { x: centerX - width / 2, y: centerY - height / 2, width, height }
    })
  }

  const panRef = React.useRef<{ startX: number; startY: number; viewBox: typeof viewBox } | null>(null)

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (tool !== 'select' || event.target !== svgRef.current) return
    panRef.current = { startX: event.clientX, startY: event.clientY, viewBox }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const pan = panRef.current
    const svg = svgRef.current
    if (!pan || !svg || svg.clientWidth === 0) return
    const scale = pan.viewBox.width / svg.clientWidth
    const dx = (event.clientX - pan.startX) * scale
    const dy = (event.clientY - pan.startY) * scale
    setViewBox({ ...pan.viewBox, x: pan.viewBox.x - dx, y: pan.viewBox.y - dy })
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-1">
        <ToolButton icon={MousePointer2} active={tool === 'select'} onClick={() => { setTool('select'); setDraftVertices([]) }} label={t('anter_configurator.canvas.tool.select', 'Select')} />
        <ToolButton icon={Minus} active={tool === 'run'} onClick={() => setTool('run')} label={t('anter_configurator.canvas.tool.run', 'Draw run')} />
        <ToolButton icon={Circle} active={tool === 'point'} onClick={() => setTool('point')} label={t('anter_configurator.canvas.tool.point', 'Place point')} />
        <ToolButton icon={DoorOpen} active={tool === 'insert'} onClick={() => setTool('insert')} label={t('anter_configurator.canvas.tool.insert', 'Place gate')} />
        <div className="mx-1 h-5 w-px bg-border" />
        <ToolButton icon={Magnet} active={gridSnap} onClick={() => setGridSnap((value) => !value)} label={t('anter_configurator.canvas.tool.gridSnap', 'Grid snap')} />
        <ToolButton icon={Ruler} active={angleSnap} onClick={() => setAngleSnap((value) => !value)} label={t('anter_configurator.canvas.tool.angleSnap', '0/45/90°')} />
        <div className="mx-1 h-5 w-px bg-border" />
        <Button type="button" variant="outline" size="icon" onClick={() => zoom(0.9)} aria-label={t('anter_configurator.canvas.zoomIn', 'Zoom in')}>
          <ZoomIn className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={() => zoom(1.1)} aria-label={t('anter_configurator.canvas.zoomOut', 'Zoom out')}>
          <ZoomOut className="size-4" />
        </Button>
        {selected ? (
          <Button type="button" variant="destructive-ghost" size="icon" onClick={removeSelected} aria-label={t('anter_configurator.canvas.delete', 'Delete selected')}>
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>

      <svg
        ref={svgRef}
        role="application"
        tabIndex={0}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="h-[520px] w-full touch-none rounded-md border border-border bg-muted/20 outline-none focus-visible:shadow-focus"
        onClick={handleCanvasClick}
        onDoubleClick={() => { if (tool === 'run') finishRun() }}
        onKeyDown={handleKeyDown}
        onWheel={(event) => { event.preventDefault(); zoom(event.deltaY > 0 ? 1.1 : 0.9) }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={() => { panRef.current = null }}
        onPointerLeave={() => { panRef.current = null }}
        aria-label={t('anter_configurator.canvas.label', 'Configurator plan canvas')}
      >
        {props.underlayUrl ? (
          <image
            href={props.underlayUrl}
            x={0}
            y={0}
            width={props.underlayWidthUnits ?? viewBox.width}
            height={props.underlayHeightUnits ?? viewBox.height}
            preserveAspectRatio="none"
          />
        ) : null}

        {props.elements.map((element) => (
          <PlanElementShape
            key={element.id}
            element={element}
            selected={element.id === props.selectedElementId}
            onSelect={(event) => { event.stopPropagation(); props.onSelectedElementChange(element.id) }}
          />
        ))}

        {draftVertices.length > 0 ? (
          <polyline
            points={draftVertices.map(([x, y]) => `${x},${y}`).join(' ')}
            className="stroke-primary"
            fill="none"
            strokeWidth={2}
            strokeDasharray="4 4"
          />
        ) : null}
      </svg>
    </div>
  )
}

function ToolButton({ icon: Icon, active, onClick, label }: {
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <Button type="button" variant={active ? 'default' : 'outline'} size="icon" onClick={onClick} aria-pressed={active} aria-label={label} title={label}>
      <Icon className="size-4" />
    </Button>
  )
}

function PlanElementShape({ element, selected, onSelect }: {
  element: ElementDraft
  selected: boolean
  onSelect: (event: React.SyntheticEvent) => void
}) {
  const strokeClass = selected ? 'stroke-status-info-icon' : 'stroke-primary'

  if (element.elementKind === 'run' && element.geometry.vertices) {
    return (
      <polyline
        points={element.geometry.vertices.map(([x, y]) => `${x},${y}`).join(' ')}
        className={strokeClass}
        fill="none"
        strokeWidth={selected ? 3 : 2}
        onClick={onSelect}
        role="img"
        aria-label={element.label ?? element.elementKind}
      />
    )
  }

  if ((element.elementKind === 'point' || element.elementKind === 'insert') && element.geometry.position) {
    const [x, y] = element.geometry.position
    return (
      <circle
        cx={x}
        cy={y}
        r={selected ? 8 : 6}
        className={strokeClass}
        fill="currentColor"
        onClick={onSelect}
        role="img"
        aria-label={element.label ?? element.elementKind}
      />
    )
  }

  return null
}

export default PlanCanvas
