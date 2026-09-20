"use client"

import * as React from 'react'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { computeAnterBom, type AnterBomElement, type AnterProductGeometry } from '../services/anterBomService'
import { AnterGeometryError } from '../services/anterGeometryService'
import type { ElementDraft } from './types'

export type ServerBomLine = {
  id: string
  sku: string | null
  nameSnapshot: string
  origin: string
  quantity: number
  unitCode: string
  realisedLengthM: number | null
  residualLengthM: number | null
  postCount: number | null
  anchorCount: number | null
  priceState: string
  netAmount: number | null
  /** Internal mode only, behind `anter_configurator.margin.view` (§3.7, R6). */
  unitCostNet?: number | null
  marginAtListNet?: number | null
  marginAfterDiscountNet?: number | null
}

export type ServerBom = {
  bomTotalNetAmount: number | null
  bomCurrencyCode: string | null
  hasUnpricedItems: boolean
  lines: ServerBomLine[]
}

export type BomPanelProps = {
  elements: ElementDraft[]
  metresPerUnit: number | null
  productGeometryByProductId: Record<string, AnterProductGeometry>
  /**
   * The server's response from the last recompute (C4) — authoritative.
   * `null` before the first save; the panel then shows the client's own
   * quantities (no prices — the client never resolves partner pricing).
   */
  serverBom: ServerBom | null
}

function toAnterBomElement(element: ElementDraft): AnterBomElement | null {
  if (element.elementKind === 'run' && element.productId && element.geometry.vertices) {
    return { id: element.id, elementKind: 'run', productId: element.productId, productVariantId: element.productVariantId ?? null, vertices: element.geometry.vertices }
  }
  if (element.elementKind === 'point' && element.productId && element.geometry.position) {
    return { id: element.id, elementKind: 'point', productId: element.productId, productVariantId: element.productVariantId ?? null, position: element.geometry.position }
  }
  if (element.elementKind === 'insert' && element.productId && element.geometry.position && element.hostElementId && element.hostOffsetRatio != null) {
    return {
      id: element.id,
      elementKind: 'insert',
      productId: element.productId,
      productVariantId: element.productVariantId ?? null,
      position: element.geometry.position,
      hostElementId: element.hostElementId,
      hostOffsetRatio: element.hostOffsetRatio,
    }
  }
  return null
}

function formatMoney(value: number | null, currencyCode: string | null): string {
  if (value == null || !currencyCode) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

/**
 * Optimistic client-side BOM (spec §3.5's determinism requirement, C4, R2):
 * imports the SAME `computeAnterBom` the server uses, so the two can only
 * ever disagree over floating-point rounding, never over the formula. The
 * server's response silently replaces this the moment it arrives — the
 * panel never renders both at once.
 */
export function BomPanel({ elements, metresPerUnit, productGeometryByProductId, serverBom }: BomPanelProps) {
  const t = useT()

  const clientResult = React.useMemo(() => {
    if (metresPerUnit == null) return null
    const bomElements = elements.map(toAnterBomElement).filter((el): el is AnterBomElement => el !== null)
    if (!bomElements.length) return { drawnLines: [], derivedLines: [] }
    try {
      return computeAnterBom({ elements: bomElements, metresPerUnit, productGeometryByProductId })
    } catch (error) {
      if (error instanceof AnterGeometryError) return null
      throw error
    }
  }, [elements, metresPerUnit, productGeometryByProductId])

  if (serverBom) {
    const showMargin = serverBom.lines.some((line) => line.unitCostNet !== undefined)
    return (
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t('anter_configurator.bom.column.product', 'Product')}</th>
              <th className="px-3 py-2">{t('anter_configurator.bom.column.quantity', 'Qty')}</th>
              <th className="px-3 py-2">{t('anter_configurator.bom.column.realised', 'Realised (m)')}</th>
              <th className="px-3 py-2">{t('anter_configurator.bom.column.residual', 'Residual (m)')}</th>
              <th className="px-3 py-2">{t('anter_configurator.bom.column.amount', 'Net amount')}</th>
              {showMargin ? (
                <>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.cost', 'Cost')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.margin', 'Margin')}</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {serverBom.lines.map((line) => (
              <tr key={line.id} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="block font-medium text-foreground">{line.nameSnapshot}</span>
                  <span className="block text-overline text-muted-foreground">{line.origin}</span>
                </td>
                <td className="px-3 py-2">{line.quantity} {line.unitCode}</td>
                <td className="px-3 py-2">{line.realisedLengthM ?? '—'}</td>
                <td className="px-3 py-2">{line.residualLengthM ?? '—'}</td>
                <td className="px-3 py-2">
                  {line.priceState === 'to_quote'
                    ? <StatusBadge variant="warning">{t('anter_configurator.bom.toQuote', 'To quote')}</StatusBadge>
                    : formatMoney(line.netAmount, serverBom.bomCurrencyCode)}
                </td>
                {showMargin ? (
                  <>
                    <td className="px-3 py-2">{formatMoney(line.unitCostNet ?? null, serverBom.bomCurrencyCode)}</td>
                    <td className="px-3 py-2">{formatMoney(line.marginAfterDiscountNet ?? line.marginAtListNet ?? null, serverBom.bomCurrencyCode)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-medium">
              <td className="px-3 py-2" colSpan={showMargin ? 6 : 4}>{t('anter_configurator.bom.total', 'Total (excluding items awaiting valuation)')}</td>
              <td className="px-3 py-2">{formatMoney(serverBom.bomTotalNetAmount, serverBom.bomCurrencyCode)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  if (!clientResult) {
    return <p className="text-sm text-muted-foreground">{t('anter_configurator.bom.calibrateFirst', 'Calibrate the plan to see quantities.')}</p>
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t('anter_configurator.bom.column.origin', 'Origin')}</th>
            <th className="px-3 py-2">{t('anter_configurator.bom.column.quantity', 'Qty')}</th>
            <th className="px-3 py-2">{t('anter_configurator.bom.column.realised', 'Realised (m)')}</th>
            <th className="px-3 py-2">{t('anter_configurator.bom.column.residual', 'Residual (m)')}</th>
          </tr>
        </thead>
        <tbody>
          {clientResult.drawnLines.map((line) => (
            <tr key={`${line.productId}:${line.origin}`} className="border-t border-border">
              <td className="px-3 py-2">{line.productId}</td>
              <td className="px-3 py-2">{line.quantity} {line.unitCode}</td>
              <td className="px-3 py-2">{line.realisedLengthM ?? '—'}</td>
              <td className="px-3 py-2">{line.residualLengthM ?? '—'}</td>
            </tr>
          ))}
          {!clientResult.drawnLines.length ? (
            <tr>
              <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                {t('anter_configurator.bom.empty', 'Draw an element to see quantities.')}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export default BomPanel
