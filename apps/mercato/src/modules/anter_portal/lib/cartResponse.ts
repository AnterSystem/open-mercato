import type { PortalContext } from './portalContext'
import type { CartView } from '../services/anterCartService'
import { computeCartTotals } from './cartTotals'

export async function buildCartResponsePayload(context: PortalContext, cart: CartView) {
  const totals = await computeCartTotals(
    context.container,
    context.em,
    { organizationId: context.organizationId, tenantId: context.tenantId },
    cart.currencyCode,
    cart.lines,
  )
  return { item: { ...cart, totals } }
}

export default buildCartResponsePayload
