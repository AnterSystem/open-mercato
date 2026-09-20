import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption, findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { AnterInvoice, AnterOrder, AnterOrderLine, AnterShipment, AnterShipmentLine } from '../data/entities'

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

export type ShipmentView = {
  id: string
  shipmentNumber: string
  sequenceNumber: number
  status: string
  carrierName: string | null
  trackingNumber: string | null
  waybillAttachmentId: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  lineIds: string[]
}

export type InvoiceView = {
  id: string
  invoiceNumber: string
  issuedAt: string
  netAmount: number
  grossAmount: number
  currencyCode: string
  attachmentId: string | null
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
  hasInvoice: boolean
}

export type OrderDetailView = OrderView & {
  shipments: ShipmentView[]
  invoice: InvoiceView | null
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

function toOrderView(order: AnterOrder, lines: AnterOrderLine[], hasInvoice: boolean): OrderView {
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
    hasInvoice,
  }
}

export type OrderSourceInfo = { id: string; source: string; configuratorRevisionId: string | null; status: string }

export type AnterOrderReadService = {
  listForPartner(scope: OrderReadScope, customerEntityId: string, query: { page: number; pageSize: number }): Promise<OrderListResult>
  getForPartner(scope: OrderReadScope, customerEntityId: string, orderId: string): Promise<OrderDetailView | null>
  // Configurator spec X10: the confirm mutation guard (registered from
  // `anter_configurator`) reads this instead of importing `AnterOrder`
  // directly — `anter_configurator → anter_orders` is the allowed direction,
  // but only through this module's own public service (§3.2).
  getSourceInfo(scope: OrderReadScope, orderId: string): Promise<OrderSourceInfo | null>
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
      const [lines, invoices] = await Promise.all([
        orderIds.length ? em.find(AnterOrderLine, { orderId: { $in: orderIds } }, { orderBy: { lineNumber: 'asc' } }) : Promise.resolve([]),
        orderIds.length ? em.find(AnterInvoice, { orderId: { $in: orderIds } }) : Promise.resolve([]),
      ])
      const linesByOrder = new Map<string, AnterOrderLine[]>()
      for (const line of lines) {
        const list = linesByOrder.get(line.orderId) ?? []
        list.push(line)
        linesByOrder.set(line.orderId, list)
      }
      const orderIdsWithInvoice = new Set(invoices.map((invoice) => invoice.orderId))
      return {
        items: orders.map((order) => toOrderView(order, linesByOrder.get(order.id) ?? [], orderIdsWithInvoice.has(order.id))),
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
      const [lines, shipments, invoice] = await Promise.all([
        em.find(AnterOrderLine, { orderId: order.id }, { orderBy: { lineNumber: 'asc' } }),
        em.find(AnterShipment, { orderId: order.id }, { orderBy: { sequenceNumber: 'asc' } }),
        em.findOne(AnterInvoice, { orderId: order.id }, { orderBy: { issuedAt: 'desc' } }),
      ])
      const shipmentIds = shipments.map((shipment) => shipment.id)
      const shipmentLines = shipmentIds.length
        ? await em.find(AnterShipmentLine, { shipmentId: { $in: shipmentIds } })
        : []
      const lineIdsByShipment = new Map<string, string[]>()
      for (const shipmentLine of shipmentLines) {
        const list = lineIdsByShipment.get(shipmentLine.shipmentId) ?? []
        list.push(shipmentLine.orderLineId)
        lineIdsByShipment.set(shipmentLine.shipmentId, list)
      }

      return {
        ...toOrderView(order, lines, invoice != null),
        shipments: shipments.map((shipment) => ({
          id: shipment.id,
          shipmentNumber: shipment.shipmentNumber,
          sequenceNumber: shipment.sequenceNumber,
          status: shipment.status,
          carrierName: shipment.carrierName ?? null,
          trackingNumber: shipment.trackingNumber ?? null,
          waybillAttachmentId: shipment.waybillAttachmentId ?? null,
          dispatchedAt: shipment.dispatchedAt ? shipment.dispatchedAt.toISOString() : null,
          deliveredAt: shipment.deliveredAt ? shipment.deliveredAt.toISOString() : null,
          lineIds: lineIdsByShipment.get(shipment.id) ?? [],
        })),
        invoice: invoice ? {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          issuedAt: invoice.issuedAt.toISOString(),
          netAmount: Number(invoice.netAmount),
          grossAmount: Number(invoice.grossAmount),
          currencyCode: invoice.currencyCode,
          attachmentId: invoice.attachmentId ?? null,
        } : null,
      }
    },

    async getSourceInfo(scope, orderId) {
      const order = await em.findOne(AnterOrder, {
        id: orderId,
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
      })
      if (!order) return null
      return {
        id: order.id,
        source: order.source,
        configuratorRevisionId: order.configuratorRevisionId ?? null,
        status: order.status,
      }
    },
  }
}

export default createAnterOrderReadService
