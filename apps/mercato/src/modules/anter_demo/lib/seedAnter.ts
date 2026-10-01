import type { EntityManager } from '@mikro-orm/postgresql'
import {
  AnterInvoice,
  AnterOrder,
  AnterOrderLine,
  AnterOrderSequence,
  AnterPartnerGroupDiscount,
  AnterPartnerTerms,
  AnterShipment,
  AnterShipmentLine,
  AnterStockAllocation,
  AnterStockItem,
} from '../../anter_orders/data/entities'
import { CatalogProduct, CatalogProductVariant } from '@open-mercato/core/modules/catalog/data/entities'
import { CustomerUser } from '@open-mercato/core/modules/customer_accounts/data/entities'
import type { CustomerUserService } from '@open-mercato/core/modules/customer_accounts/services/customerUserService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { AnterDemoScope, AnterFixture } from './types'
import type { EntityRefs } from './seedCustomers'

const logger = createLogger('anter_demo')

export type AnterSeedResult = {
  partnerTerms: number
  groupDiscounts: number
  stockItems: number
  orders: number
  orderLines: number
  shipments: number
  shipmentLines: number
  allocations: number
  invoices: number
  sequences: number
  skipped: number
}

/**
 * Historical demo orders are persisted as final records rather than replayed
 * through `anter_orders.order.place`: the fixture already carries settled
 * numbers, statuses and timestamps, and the place command would recompute them
 * from a cart that no longer exists.
 */
export async function seedAnterOperations(
  em: EntityManager,
  scope: AnterDemoScope,
  fixture: AnterFixture,
  refs: { companyRefs: EntityRefs },
  userService: CustomerUserService,
): Promise<AnterSeedResult> {
  const result: AnterSeedResult = {
    partnerTerms: 0, groupDiscounts: 0, stockItems: 0, orders: 0,
    orderLines: 0, shipments: 0, shipmentLines: 0, allocations: 0,
    invoices: 0, sequences: 0, skipped: 0,
  }
  const base = { organizationId: scope.organizationId, tenantId: scope.tenantId }

  const products = await em.find(CatalogProduct, { ...base, deletedAt: null })
  const productIdBySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku as string, p.id]))
  const variants = await em.find(CatalogProductVariant, { ...base, deletedAt: null })
  const variantIdBySku = new Map(variants.filter((v) => v.sku).map((v) => [v.sku as string, v.id]))

  const resolveProduct = (sku: string, context: string): string | null => {
    const id = productIdBySku.get(sku)
    if (!id) logger.warn('anter_demo.seed product sku not found; skipping', { sku, context })
    return id ?? null
  }

  // --- partner terms --------------------------------------------------------
  const termsByCompany = new Map<string, AnterPartnerTerms>()
  for (const terms of fixture.partnerTerms) {
    const customerEntityId = refs.companyRefs.get(terms.companyRef)
    if (!customerEntityId) {
      logger.warn('anter_demo.seed partner terms company not found; skipping', { companyRef: terms.companyRef })
      continue
    }
    let record = await em.findOne(AnterPartnerTerms, { ...base, customerEntityId, deletedAt: null })
    if (record) {
      result.skipped += 1
    } else {
      record = em.create(AnterPartnerTerms, {
        ...base,
        customerEntityId,
        defaultDiscountRate: String(terms.defaultDiscountRate),
        priceListCode: terms.priceListCode ?? null,
        isBlocked: terms.isBlocked,
        notes: terms.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      em.persist(record)
      result.partnerTerms += 1
    }
    termsByCompany.set(terms.companyRef, record)
  }
  await em.flush()

  for (const discount of fixture.partnerGroupDiscounts) {
    const terms = termsByCompany.get(discount.companyRef)
    if (!terms) continue
    em.persist(em.create(AnterPartnerGroupDiscount, {
      ...base,
      partnerTermsId: terms.id,
      categoryId: discount.categoryId ?? null,
      discountRate: String(discount.discountRate),
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.groupDiscounts += 1
  }

  // --- stock ----------------------------------------------------------------
  for (const item of fixture.stockItems) {
    const productId = resolveProduct(item.productSku, 'stock item')
    if (!productId) continue
    const variantId = item.variantSku ? variantIdBySku.get(item.variantSku) ?? null : null
    const existing = await em.findOne(AnterStockItem, { ...base, productId, variantId, deletedAt: null })
    if (existing) {
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterStockItem, {
      ...base,
      productId,
      variantId,
      onHand: item.onHand,
      expectedRestockAt: item.expectedRestockAt ? new Date(item.expectedRestockAt) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.stockItems += 1
  }
  await em.flush()

  const stockKey = (productSku: string, variantSku: string | null) => `${productSku}|${variantSku ?? ''}`
  const stockIdByRef = new Map<string, string>()
  for (const item of await em.find(AnterStockItem, { ...base, deletedAt: null })) {
    const productSku = [...productIdBySku].find(([, id]) => id === item.productId)?.[0]
    if (!productSku) continue
    const variantSku = item.variantId
      ? [...variantIdBySku].find(([, id]) => id === item.variantId)?.[0] ?? null
      : null
    stockIdByRef.set(stockKey(productSku, variantSku), item.id)
  }

  // --- orders ---------------------------------------------------------------
  const orderIdByNumber = new Map<string, string>()
  for (const order of fixture.orders) {
    const existing = await em.findOne(AnterOrder, { ...base, orderNumber: order.orderNumber, deletedAt: null })
    if (existing) {
      orderIdByNumber.set(order.orderNumber, existing.id)
      result.skipped += 1
      continue
    }
    const customerEntityId = refs.companyRefs.get(order.companyRef)
    if (!customerEntityId) {
      logger.warn('anter_demo.seed order company not found; skipping', { order: order.orderNumber })
      continue
    }
    const customerUser = order.customerUserRef
      ? await userService.findByEmail(order.customerUserRef, scope.tenantId)
      : null
    if (!customerUser) {
      logger.warn('anter_demo.seed order portal user not found; skipping', {
        order: order.orderNumber, email: order.customerUserRef,
      })
      continue
    }

    const record = em.create(AnterOrder, {
      ...base,
      orderNumber: order.orderNumber,
      customerEntityId,
      customerUserId: (customerUser as CustomerUser).id,
      source: order.source,
      status: order.status,
      currencyCode: order.currencyCode,
      deliveryMode: order.deliveryMode,
      deliveryAddressSnapshot: order.deliveryAddressSnapshot ?? null,
      paymentTermsDays: order.paymentTermsDays,
      subtotalNetAmount: String(order.subtotalNetAmount),
      discountTotalAmount: String(order.discountTotalAmount),
      shippingNetAmount: String(order.shippingNetAmount),
      taxTotalAmount: String(order.taxTotalAmount),
      grandTotalNetAmount: String(order.grandTotalNetAmount),
      grandTotalGrossAmount: String(order.grandTotalGrossAmount),
      partnerReference: order.partnerReference ?? null,
      notes: order.notes ?? null,
      placedAt: order.placedAt ? new Date(order.placedAt) : null,
      confirmedAt: order.confirmedAt ? new Date(order.confirmedAt) : null,
      closedAt: order.closedAt ? new Date(order.closedAt) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(record)
    await em.flush()
    orderIdByNumber.set(order.orderNumber, record.id)
    result.orders += 1

    for (const line of order.lines) {
      const productId = resolveProduct(line.productSku, `order ${order.orderNumber}`)
      if (!productId) continue
      em.persist(em.create(AnterOrderLine, {
        ...base,
        orderId: record.id,
        lineNumber: line.lineNumber,
        productId,
        productVariantId: line.variantSku ? variantIdBySku.get(line.variantSku) ?? null : null,
        sku: line.sku ?? null,
        nameSnapshot: line.nameSnapshot,
        variantSnapshot: line.variantSnapshot ?? null,
        quantity: String(line.quantity),
        unitCode: line.unitCode ?? null,
        listUnitPriceNet: String(line.listUnitPriceNet),
        unitPriceNet: String(line.unitPriceNet),
        discountAmount: String(line.discountAmount),
        taxRate: String(line.taxRate),
        netAmount: String(line.netAmount),
        grossAmount: String(line.grossAmount),
        fulfilmentMode: line.fulfilmentMode,
        lineStatus: line.lineStatus,
        shippedQuantity: String(line.shippedQuantity),
        expectedAt: line.expectedAt ? new Date(line.expectedAt) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
      result.orderLines += 1
    }
    await em.flush()
  }

  // Allocations and shipment lines address order lines by (order, line number).
  const orderLineIdByRef = new Map<string, string>()
  for (const [orderNumber, orderId] of orderIdByNumber) {
    for (const line of await em.find(AnterOrderLine, { ...base, orderId })) {
      orderLineIdByRef.set(`${orderNumber}#${line.lineNumber}`, line.id)
    }
  }

  // --- shipments & invoices -------------------------------------------------
  for (const shipment of fixture.shipments) {
    const orderId = orderIdByNumber.get(shipment.orderNumber)
    if (!orderId) continue
    const existing = await em.findOne(AnterShipment, { ...base, shipmentNumber: shipment.shipmentNumber })
    if (existing) {
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterShipment, {
      ...base,
      orderId,
      shipmentNumber: shipment.shipmentNumber,
      sequenceNumber: shipment.sequenceNumber,
      status: shipment.status,
      carrierName: shipment.carrierName ?? null,
      trackingNumber: shipment.trackingNumber ?? null,
      weightKg: shipment.weightKg == null ? null : String(shipment.weightKg),
      packageCount: shipment.packageCount ?? null,
      shippingCostNet: String(shipment.shippingCostNet),
      dispatchedAt: shipment.dispatchedAt ? new Date(shipment.dispatchedAt) : null,
      deliveredAt: shipment.deliveredAt ? new Date(shipment.deliveredAt) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.shipments += 1
  }

  await em.flush()

  const shipmentIdByNumber = new Map<string, string>()
  for (const shipment of await em.find(AnterShipment, { ...base })) {
    shipmentIdByNumber.set(shipment.shipmentNumber, shipment.id)
  }

  for (const line of fixture.shipmentLines) {
    const shipmentId = shipmentIdByNumber.get(line.shipmentNumber)
    const orderLineId = orderLineIdByRef.get(`${line.orderLineRef.orderNumber}#${line.orderLineRef.lineNumber}`)
    if (!shipmentId || !orderLineId) continue
    const existing = await em.findOne(AnterShipmentLine, { ...base, shipmentId, orderLineId })
    if (existing) {
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterShipmentLine, {
      ...base,
      shipmentId,
      orderLineId,
      quantity: String(line.quantity),
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.shipmentLines += 1
  }

  for (const allocation of fixture.stockAllocations) {
    const orderLineId = orderLineIdByRef.get(
      `${allocation.orderLineRef.orderNumber}#${allocation.orderLineRef.lineNumber}`,
    )
    const stockItemId = stockIdByRef.get(stockKey(allocation.stockRef.productSku, allocation.stockRef.variantSku))
    if (!orderLineId || !stockItemId) continue
    const existing = await em.findOne(AnterStockAllocation, { ...base, orderLineId, stockItemId })
    if (existing) {
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterStockAllocation, {
      ...base,
      orderLineId,
      stockItemId,
      quantity: String(allocation.quantity),
      status: allocation.status,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.allocations += 1
  }
  await em.flush()

  for (const invoice of fixture.invoices) {
    const orderId = orderIdByNumber.get(invoice.orderNumber)
    if (!orderId) continue
    const existing = await em.findOne(AnterInvoice, { ...base, invoiceNumber: invoice.invoiceNumber })
    if (existing) {
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterInvoice, {
      ...base,
      orderId,
      invoiceNumber: invoice.invoiceNumber,
      issuedAt: invoice.issuedAt ? new Date(invoice.issuedAt) : new Date(),
      netAmount: String(invoice.netAmount),
      grossAmount: String(invoice.grossAmount),
      currencyCode: invoice.currencyCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.invoices += 1
  }

  // --- numbering ------------------------------------------------------------
  for (const sequence of fixture.orderSequences) {
    const existing = await em.findOne(AnterOrderSequence, { ...base, year: sequence.year })
    if (existing) {
      // Never rewind live numbering — a lower fixture value must not reissue
      // order numbers that already exist.
      if (existing.nextNumber < sequence.nextNumber) existing.nextNumber = sequence.nextNumber
      result.skipped += 1
      continue
    }
    em.persist(em.create(AnterOrderSequence, {
      ...base,
      year: sequence.year,
      nextNumber: sequence.nextNumber,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    result.sequences += 1
  }

  await em.flush()
  return result
}
