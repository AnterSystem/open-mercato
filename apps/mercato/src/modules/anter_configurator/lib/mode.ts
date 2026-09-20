import { NextResponse } from 'next/server'
import type { AnterPartnerTermsService } from '../../anter_orders/services/anterPartnerTermsService'
import { resolvePortalConfiguratorMode } from '../services/anterConfiguratorModeService'
import type { AnterConfiguratorPortalContext } from './portalContext'

export type PricedPortalMode = 'partner_priced' | 'partner_unpriced'

/**
 * Resolves the caller's mode and returns the ready-to-send 403 when the
 * account is `denied` (spec §3.7 rule 3 — explained, never blank). Every
 * portal route that touches a project/revision calls this right after
 * `resolveAnterConfiguratorPortalContext`.
 */
export async function requirePortalConfiguratorMode(
  context: AnterConfiguratorPortalContext,
): Promise<{ mode: PricedPortalMode } | Response> {
  const anterPartnerTermsService = context.container.resolve<AnterPartnerTermsService>('anterPartnerTermsService')
  const resolution = await resolvePortalConfiguratorMode({
    em: context.em,
    anterPartnerTermsService,
    customerEntityId: context.customerEntityId,
    scope: { organizationId: context.organizationId, tenantId: context.tenantId },
  })
  if (resolution.mode === 'denied') {
    return NextResponse.json(resolution.body, { status: 403 })
  }
  return { mode: resolution.mode }
}

type BomLineLike = Record<string, unknown> & { priceState?: string }
type BomLike = { bomTotalNetAmount?: unknown; lines?: BomLineLike[] } | null | undefined

/**
 * Prices are omitted, not nulled (§3.7 rule 2) — a `partner_unpriced` caller
 * never sees a price key, on ANY line, regardless of that line's own
 * `priceState`. Applied to every BOM-shaped response this module returns to
 * the portal, so a `partner_unpriced` caller can never see a number that
 * happened to resolve internally.
 */
export function redactBomForMode<T extends BomLike>(bom: T, mode: PricedPortalMode): T {
  if (mode !== 'partner_unpriced' || !bom) return bom
  const { bomTotalNetAmount, lines, ...rest } = bom as Exclude<BomLike, null | undefined>
  void bomTotalNetAmount
  return {
    ...rest,
    lines: (lines ?? []).map((line) => {
      const { partnerUnitPriceNet, listUnitPriceNet, netAmount, discountRate, unitCostNet, marginAtListNet, marginAfterDiscountNet, ...lineRest } = line
      void partnerUnitPriceNet
      void listUnitPriceNet
      void netAmount
      void discountRate
      void unitCostNet
      void marginAtListNet
      void marginAfterDiscountNet
      return lineRest
    }),
  } as T
}
