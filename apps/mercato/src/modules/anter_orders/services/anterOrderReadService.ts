import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AnterOrder, AnterOrderLine } from '../data/entities'

export type OrderReadScope = { organizationId: string; tenantId: string }

export type OrderLineView = {
  id: string
  lineNumber: number
  productId: string
  productVariantId: string | null
  sku: string | null
  nameSnapshot: string
  quantity: number
  unitCode: string | null
  unitPriceNet: number
  taxRate: number
  netAmount: number
  grossAmount: number
  fulfilmentMode: string
  lineStatus: string
  shippedQuantity: number
  expectedAt: string | null
}

export type OrderView = {
  id: string
  orderNumber: string
  status: string
  currencyCode: string
  deliveryMode: string
  deliveryAddressSnapshot: Record<string, unknown> | null
  subtotalNetAmount: number
  discountTotalAmount: number
  shippingNetAmount: number
  taxTotalAmount: number
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
  partnerReference: string | null
  notes: string | null
  placedAt: string | null
  confirmedAt: string | null
  closedAt: string | null
  updatedAt: string
  lines: OrderLineView[]
}

export type OrderListResult = { items: OrderView[]; total: number; page: number; pageSize: number }

function toLineView(line: AnterOrderLine): OrderLineView {
  return {
    id: line.id,
    lineNumber: line.lineNumber,
    productId: line.productId,
    productVariantId: line.productVariantId ?? null,
    sku: line.sku ?? null,
    nameSnapshot: line.nameSnapshot,
    quantity: Number(line.quantity),
    unitCode: line.unitCode ?? null,
    unitPriceNet: Number(line.unitPriceNet),
    taxRate: Number(line.taxRate),
    netAmount: Number(line.netAmount),
    grossAmount: Number(line.grossAmount),
    fulfilmentMode: line.fulfilmentMode,
    lineStatus: line.lineStatus,
    shippedQuantity: Number(line.shippedQuantity),
    expectedAt: line.expectedAt ? line.expectedAt.toISOString() : null,
  }
}

function toOrderView(order: AnterOrder, lines: AnterOrderLine[]): OrderView {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    currencyCode: order.currencyCode,
    deliveryMode: order.deliveryMode,
    deliveryAddressSnapshot: order.deliveryAddressSnapshot ?? null,
    subtotalNetAmount: Number(order.subtotalNetAmount),
    discountTotalAmount: Number(order.discountTotalAmount),
    shippingNetAmount: Number(order.shippingNetAmount),
    taxTotalAmount: Number(order.taxTotalAmount),
    grandTotalNetAmount: Number(order.grandTotalNetAmount),
    grandTotalGrossAmount: Number(order.grandTotalGrossAmount),
    partnerReference: order.partnerReference ?? null,
    notes: order.notes ?? null,
    placedAt: order.placedAt ? order.placedAt.toISOString() : null,
    confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
    closedAt: order.closedAt ? order.closedAt.toISOString() : null,
    updatedAt: order.updatedAt.toISOString(),
    lines: lines.map(toLineView),
  }
}

export type AnterOrderReadService = {
  listForPartner(scope: OrderReadScope, customerEntityId: string, query: { page: number; pageSize: number }): Promise<OrderListResult>
  getForPartner(scope: OrderReadScope, customerEntityId: string, orderId: string): Promise<OrderView | null>
}

/**
 * Portal-facing order reads (spec API Contracts: `GET /api/anter_portal/orders[/id]`
 * "Via `anterOrderReadService`"). Lives in `anter_orders` — the entity owner —
 * and is consumed by `anter_portal` across the module boundary (§3.2 allows
 * `anter_portal → anter_orders`). Every read is scoped to `customerEntityId`
 * from the caller's JWT (never a request parameter, §3.10): an order
 * belonging to another partner is invisible, not merely forbidden — `404`,
 * not `403` (§API Contracts).
 */
export function createAnterOrderReadService(deps: { em: EntityManager }): AnterOrderReadService {
  const { em } = deps

  return {
    async listForPartner(scope, customerEntityId, query) {
      const page = Math.max(1, query.page)
      const pageSize = Math.min(100, Math.max(1, query.pageSize))
      const [orders, total] = await Promise.all([
        findWithDecryption(em, AnterOrder, {
          customerEntityId,
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          deletedAt: null,
        }, {
          limit: pageSize,
          offset: (page - 1) * pageSize,
          orderBy: { placedAt: 'desc' },
        }, { tenantId: scope.tenantId, organizationId: scope.organizationId }),
        em.count(AnterOrder, {
          customerEntityId,
          organizationId: scope.organizationId,
          tenantId: scope.tenantId,
          deletedAt: null,
        }),
      ])
      const orderIds = orders.map((order) => order.id)
      const lines = orderIds.length
        ? await em.find(AnterOrderLine, { orderId: { $in: orderIds } }, { orderBy: { lineNumber: 'asc' } })
        : []
      const linesByOrder = new Map<string, AnterOrderLine[]>()
      for (const line of lines) {
        const list = linesByOrder.get(line.orderId) ?? []
        list.push(line)
        linesByOrder.set(line.orderId, list)
      }
      return {
        items: orders.map((order) => toOrderView(order, linesByOrder.get(order.id) ?? [])),
        total,
        page,
        pageSize,
      }
    },

    async getForPartner(scope, customerEntityId, orderId) {
      const order = await findOneWithDecryption(em, AnterOrder, {
        id: orderId,
        customerEntityId,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        deletedAt: null,
      }, undefined, { tenantId: scope.tenantId, organizationId: scope.organizationId })
      if (!order) return null
      const lines = await em.find(AnterOrderLine, { orderId: order.id }, { orderBy: { lineNumber: 'asc' } })
      return toOrderView(order, lines)
    },
  }
}

export default createAnterOrderReadService
