import type { EntityManager } from '@mikro-orm/postgresql'
import type { AppContainer } from '@open-mercato/shared/lib/di/container'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CommandBus } from '@open-mercato/shared/lib/commands/command-bus'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { CatalogPricingService } from '@open-mercato/core/modules/catalog/services/catalogPricingService'
import {
  CatalogProduct,
  CatalogProductCategoryAssignment,
  CatalogProductPrice,
} from '@open-mercato/core/modules/catalog/data/entities'
import type { PriceRow, PricingContext } from '@open-mercato/core/modules/catalog/lib/pricing'
import type { SalesLineSnapshot } from '@open-mercato/core/modules/sales/lib/types'
import { AnterCart, AnterCartLine } from '../data/entities'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import type { AnterOrderPlaceInput } from '../../anter_orders/data/validators'
import { loadPartnerDiscountLookup } from '../lib/partnerDiscount'
import { resolveCalculationService } from '../lib/cartTotals'

export type CheckoutScope = { organizationId: string; tenantId: string }
export type CheckoutPrincipal = { customerEntityId: string; customerUserId: string }
export type CheckoutInput = { partnerReference?: string | null }

export type CheckoutResult = {
  orderId: string
  orderNumber: string
  status: string
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
}

export type AnterCheckoutService = {
  placeOrder(scope: CheckoutScope, principal: CheckoutPrincipal, request: Request, input: CheckoutInput): Promise<CheckoutResult>
}

const CART_RESOURCE_KIND = 'anter_portal.cart'

type RepricedLine = {
  line: AnterCartLine
  taxRate: number
  listUnitPriceNet: number
  partnerUnitPriceNet: number
  changed: boolean
}

function toMoney(value: number): string {
  return value.toFixed(2)
}

function toSalesLine(entry: RepricedLine, currencyCode: string, unitPriceNet: number): SalesLineSnapshot {
  return {
    kind: 'product',
    productId: entry.line.productId,
    productVariantId: entry.line.productVariantId ?? null,
    name: entry.line.nameSnapshot,
    quantity: Number(entry.line.quantity),
    currencyCode,
    unitPriceNet,
    taxRate: entry.taxRate,
  }
}

const SHIPPING_LINE: SalesLineSnapshot = {
  kind: 'shipping',
  name: 'Shipping',
  quantity: 1,
  currencyCode: '',
  unitPriceNet: 0,
  taxRate: 0,
}

/**
 * Checkout orchestration (spec §3.3, Implementation Plan step 13). Re-prices
 * every cart line in ONE batch pass (§Performance: "the same rule applies to
 * ... placement" — never a per-line resolver call), and fails with `409` if
 * any re-priced line disagrees with what the cart displayed rather than
 * silently charging a different price (§3.3 "being surprising is safer than
 * being smooth"). Stock allocation is Phase B (`AnterStockAllocation` does
 * not exist yet, per `orderPlace.ts`'s own docstring) — this service does
 * not gate on availability at checkout time.
 */
export function createAnterCheckoutService(deps: {
  em: EntityManager
  container: AppContainer
  catalogPricingService: CatalogPricingService
  anterPartnerTermsService: AnterPartnerTermsService
}): AnterCheckoutService {
  const { em, container, catalogPricingService, anterPartnerTermsService } = deps

  async function repriceLines(scope: CheckoutScope, principal: CheckoutPrincipal, lines: AnterCartLine[]): Promise<RepricedLine[]> {
    const productIds = Array.from(new Set(lines.map((line) => line.productId)))
    const variantIds = Array.from(new Set(lines.map((line) => line.productVariantId).filter((id): id is string => !!id)))

    const [products, productPriceRows, variantPriceRows, categoryAssignments] = await Promise.all([
      em.find(CatalogProduct, { id: { $in: productIds }, organizationId: scope.organizationId, tenantId: scope.tenantId }),
      em.find(CatalogProductPrice, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        product: { $in: productIds },
        variant: null,
      }) as unknown as Promise<PriceRow[]>,
      variantIds.length
        ? (em.find(CatalogProductPrice, {
            organizationId: scope.organizationId,
            tenantId: scope.tenantId,
            variant: { $in: variantIds },
          }) as unknown as Promise<PriceRow[]>)
        : Promise.resolve([] as PriceRow[]),
      em.find(CatalogProductCategoryAssignment, {
        organizationId: scope.organizationId,
        tenantId: scope.tenantId,
        product: { $in: productIds },
      }),
    ])

    const productById = new Map(products.map((product) => [product.id, product]))
    const productPricesByProduct = new Map<string, PriceRow[]>()
    for (const row of productPriceRows) {
      const productId = typeof row.product === 'string' ? row.product : row.product?.id
      if (!productId) continue
      const list = productPricesByProduct.get(productId) ?? []
      list.push(row)
      productPricesByProduct.set(productId, list)
    }
    const variantPricesByVariant = new Map<string, PriceRow[]>()
    for (const row of variantPriceRows) {
      const variantId = typeof row.variant === 'string' ? row.variant : row.variant?.id
      if (!variantId) continue
      const list = variantPricesByVariant.get(variantId) ?? []
      list.push(row)
      variantPricesByVariant.set(variantId, list)
    }
    const categoryIdsByProduct = new Map<string, string[]>()
    for (const assignment of categoryAssignments) {
      const productId = typeof assignment.product === 'string' ? assignment.product : assignment.product.id
      const categoryId = typeof assignment.category === 'string' ? assignment.category : assignment.category.id
      const list = categoryIdsByProduct.get(productId) ?? []
      list.push(categoryId)
      categoryIdsByProduct.set(productId, list)
    }

    const entries = lines.map((line): { rows: PriceRow[]; context: PricingContext } => {
      const rows = line.productVariantId
        ? (variantPricesByVariant.get(line.productVariantId)?.length ? variantPricesByVariant.get(line.productVariantId)! : productPricesByProduct.get(line.productId) ?? [])
        : productPricesByProduct.get(line.productId) ?? []
      return { rows, context: { quantity: Number(line.quantity), date: new Date() } }
    })
    const resolvedPrices = await catalogPricingService.resolvePriceMany(entries)

    const discountLookup = await loadPartnerDiscountLookup(
      em,
      anterPartnerTermsService,
      { organizationId: scope.organizationId, tenantId: scope.tenantId, customerId: principal.customerEntityId },
      categoryIdsByProduct,
    )

    return lines.map((line, index) => {
      const product = productById.get(line.productId)
      const resolved = resolvedPrices[index]
      const listUnitPriceNet = resolved?.unitPriceNet != null ? Number(resolved.unitPriceNet) : null
      if (listUnitPriceNet == null || product?.isQuoteOnly) {
        // A line that was priced when added but is quote_only now — CC-5 never
        // allows this to persist; refuse the whole checkout rather than drop it.
        throw new CrudHttpError(422, { error: '[internal] anter_portal cart line is no longer orderable', lineId: line.id })
      }
      const discountRate = discountLookup ? discountLookup.discountRateFor(line.productId) : 0
      const partnerUnitPriceNet = Math.round(listUnitPriceNet * (1 - discountRate) * 10000) / 10000
      const previousPartnerUnitPriceNet = line.partnerUnitPriceNet != null ? Number(line.partnerUnitPriceNet) : null
      const changed = previousPartnerUnitPriceNet == null || Math.abs(previousPartnerUnitPriceNet - partnerUnitPriceNet) > 0.0001
      return {
        line,
        taxRate: product?.taxRate != null ? Number(product.taxRate) : 0,
        listUnitPriceNet,
        partnerUnitPriceNet,
        changed,
      }
    })
  }

  async function placeOrder(scope: CheckoutScope, principal: CheckoutPrincipal, request: Request, input: CheckoutInput): Promise<CheckoutResult> {
    // `delivery_address_snapshot` is encrypted at rest (spec Data Model
    // §Sensitive data) — every read goes through `findOneWithDecryption`.
    const cart = await findOneWithDecryption(em, AnterCart, {
      customerUserId: principal.customerUserId,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      status: 'active',
      deletedAt: null,
    }, undefined, { tenantId: scope.tenantId, organizationId: scope.organizationId })
    if (!cart) throw new CrudHttpError(422, { error: '[internal] anter_portal cart is empty' })

    enforceCommandOptimisticLock({ resourceKind: CART_RESOURCE_KIND, resourceId: cart.id, current: cart.updatedAt, request })

    const terms = await anterPartnerTermsService.getByCustomerEntityId(principal.customerEntityId, scope)
    if (terms?.isBlocked) throw new CrudHttpError(403, { error: 'ordering_blocked' })

    const lines = await em.find(AnterCartLine, {
      cartId: cart.id,
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
    }, { orderBy: { createdAt: 'asc' } })
    if (!lines.length) throw new CrudHttpError(422, { error: '[internal] anter_portal cart is empty' })
    if (!cart.deliveryMode) throw new CrudHttpError(422, { error: '[internal] anter_portal cart delivery mode is required' })

    const repriced = await repriceLines(scope, principal, lines)
    const calculationService = resolveCalculationService(container)

    if (repriced.some((entry) => entry.changed)) {
      const previousCalculation = await calculationService.calculateDocumentTotals({
        documentKind: 'order',
        lines: [
          ...repriced.map((entry) => toSalesLine(entry, cart.currencyCode, entry.line.partnerUnitPriceNet != null ? Number(entry.line.partnerUnitPriceNet) : 0)),
          { ...SHIPPING_LINE, currencyCode: cart.currencyCode },
        ],
        context: { tenantId: scope.tenantId, organizationId: scope.organizationId, currencyCode: cart.currencyCode },
      })
      const currentCalculation = await calculationService.calculateDocumentTotals({
        documentKind: 'order',
        lines: [
          ...repriced.map((entry) => toSalesLine(entry, cart.currencyCode, entry.partnerUnitPriceNet)),
          { ...SHIPPING_LINE, currencyCode: cart.currencyCode },
        ],
        context: { tenantId: scope.tenantId, organizationId: scope.organizationId, currencyCode: cart.currencyCode },
      })
      throw new CrudHttpError(409, {
        error: 'price_changed',
        previousGrandTotalNet: toMoney(previousCalculation.totals.grandTotalNetAmount),
        currentGrandTotalNet: toMoney(currentCalculation.totals.grandTotalNetAmount),
        changedLines: repriced
          .filter((entry) => entry.changed)
          .map((entry) => ({
            lineId: entry.line.id,
            previousUnitPriceNet: toMoney(entry.line.partnerUnitPriceNet != null ? Number(entry.line.partnerUnitPriceNet) : 0),
            currentUnitPriceNet: toMoney(entry.partnerUnitPriceNet),
          })),
      })
    }

    const partnerReference = input.partnerReference !== undefined
      ? (input.partnerReference?.length ? input.partnerReference : null)
      : cart.partnerReference

    const commandInput: AnterOrderPlaceInput = {
      organizationId: scope.organizationId,
      tenantId: scope.tenantId,
      customerEntityId: principal.customerEntityId,
      customerUserId: principal.customerUserId,
      currencyCode: cart.currencyCode,
      deliveryMode: cart.deliveryMode as AnterOrderPlaceInput['deliveryMode'],
      deliveryAddressSnapshot: cart.deliveryAddressSnapshot ?? null,
      paymentTermsDays: 0,
      shippingNetAmount: 0,
      partnerReference,
      notes: cart.notes ?? null,
      sourceCartId: cart.id,
      lines: repriced.map((entry) => ({
        productId: entry.line.productId,
        productVariantId: entry.line.productVariantId ?? null,
        sku: entry.line.sku ?? null,
        nameSnapshot: entry.line.nameSnapshot ?? '',
        variantSnapshot: entry.line.variantSnapshot ?? null,
        quantity: Number(entry.line.quantity),
        unitCode: entry.line.unitCode ?? null,
        listUnitPriceNet: entry.listUnitPriceNet,
        unitPriceNet: entry.partnerUnitPriceNet,
        taxRate: entry.taxRate,
      })),
    }

    const commandBus = container.resolve<CommandBus>('commandBus')
    const commandCtx: CommandRuntimeContext = {
      container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: scope.organizationId,
      organizationIds: [scope.organizationId],
      request,
    }
    const { result } = await commandBus.execute<AnterOrderPlaceInput, CheckoutResult>('anter_orders.order.place', {
      input: commandInput,
      ctx: commandCtx,
    })

    await withAtomicFlush(em, [
      () => {
        cart.status = 'converted'
        cart.convertedOrderId = result.orderId
        cart.updatedAt = new Date()
      },
    ], { transaction: true, label: 'anter_portal.checkout.convertCart' })

    return result
  }

  return { placeOrder }
}

export default createAnterCheckoutService
