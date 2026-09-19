"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Input } from '@open-mercato/ui/primitives/input'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { RadioGroup, Radio } from '@open-mercato/ui/primitives/radio'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader, PortalCardDivider, PortalStatRow } from '@open-mercato/ui/portal/components/PortalCard'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'

type Props = { params: { orgSlug: string } }

type CartLine = {
  id: string
  productId: string
  productVariantId: string | null
  sku: string | null
  nameSnapshot: string | null
  quantity: number
  unitCode: string | null
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number
  currencyCode: string
}

type CartTotals = {
  subtotalNetAmount: number
  discountTotalAmount: number
  shippingNetAmount: number
  taxTotalAmount: number
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
}

type Cart = {
  id: string
  status: string
  currencyCode: string
  deliveryMode: 'partner_warehouse' | 'end_customer' | 'self_collection' | null
  partnerReference: string | null
  notes: string | null
  updatedAt: string
  totals: CartTotals
  lines: CartLine[]
}

const DELIVERY_MODES = ['partner_warehouse', 'end_customer', 'self_collection'] as const

function formatMoney(value: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

export default function AnterPortalCartPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [cart, setCart] = React.useState<Cart | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [checkoutError, setCheckoutError] = React.useState<string | null>(null)
  const [reference, setReference] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [deliveryMode, setDeliveryMode] = React.useState<Cart['deliveryMode']>('self_collection')
  const [submitting, setSubmitting] = React.useState(false)

  const lineMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_portal.cart.line' })
  const headerMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_portal.cart.header' })
  const checkoutMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_portal.cart.checkout' })

  const loadCart = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const res = await apiCall<{ item: Cart }>('/api/anter_portal/cart')
    if (!res.ok || !res.result) {
      setError(t('anter_portal.cart.loadError', 'Failed to load your cart'))
      setIsLoading(false)
      return
    }
    setCart(res.result.item)
    setReference(res.result.item.partnerReference ?? '')
    setNotes(res.result.item.notes ?? '')
    setDeliveryMode(res.result.item.deliveryMode ?? 'self_collection')
    setIsLoading(false)
  }, [t])

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    void loadCart()
  }, [user, loadCart])

  const handleQuantityChange = React.useCallback(async (line: CartLine, quantity: number) => {
    if (!cart || quantity < 1) return
    const result = await lineMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(cart.updatedAt),
        () => apiCall<{ item: Cart }>(`/api/anter_portal/cart/lines/${line.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ quantity }),
        }),
      ),
      context: {
        moduleId: 'anter_portal',
        entityId: 'anter_portal.cart_line',
        operation: 'update',
        resourceKind: 'anter_portal.cart',
        resourceId: cart.id,
        formId: 'anter_portal.cart.line',
        retryLastMutation: lineMutation.retryLastMutation,
      },
      mutationPayload: { lineId: line.id, quantity },
    })
    if (!result.ok || !result.result) {
      const message = result.status === 409
        ? t('anter_portal.errors.outOfStock', 'Not enough stock available for this item.')
        : t('anter_portal.cart.updateError', 'Could not update this line')
      flash(message, 'error')
      if (result.status === 409) void loadCart()
      return
    }
    setCart(result.result.item)
  }, [cart, lineMutation, loadCart, t])

  const handleRemoveLine = React.useCallback(async (line: CartLine) => {
    if (!cart) return
    const result = await lineMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(cart.updatedAt),
        () => apiCall<{ item: Cart }>(`/api/anter_portal/cart/lines/${line.id}`, {
          method: 'DELETE',
          credentials: 'include',
        }),
      ),
      context: {
        moduleId: 'anter_portal',
        entityId: 'anter_portal.cart_line',
        operation: 'delete',
        resourceKind: 'anter_portal.cart',
        resourceId: cart.id,
        formId: 'anter_portal.cart.line',
        retryLastMutation: lineMutation.retryLastMutation,
      },
      mutationPayload: { lineId: line.id },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_portal.cart.updateError', 'Could not update this line'), 'error')
      return
    }
    setCart(result.result.item)
  }, [cart, lineMutation, t])

  const handleSaveDetails = React.useCallback(async () => {
    if (!cart) return
    const result = await headerMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(cart.updatedAt),
        () => apiCall<{ item: Cart }>('/api/anter_portal/cart', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ deliveryMode, partnerReference: reference, notes }),
        }),
      ),
      context: {
        moduleId: 'anter_portal',
        entityId: 'anter_portal.cart',
        operation: 'update',
        resourceKind: 'anter_portal.cart',
        resourceId: cart.id,
        formId: 'anter_portal.cart.header',
        retryLastMutation: headerMutation.retryLastMutation,
      },
      mutationPayload: { deliveryMode, partnerReference: reference, notes },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_portal.cart.updateError', 'Could not save your changes'), 'error')
      return
    }
    setCart(result.result.item)
    flash(t('anter_portal.cart.saveSuccess', 'Saved'), 'success')
  }, [cart, deliveryMode, reference, notes, headerMutation, t])

  const handlePlaceOrder = React.useCallback(async () => {
    if (!cart) return
    setCheckoutError(null)
    setSubmitting(true)
    const result = await checkoutMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(cart.updatedAt),
        () => apiCall<{ item: { orderId: string } }>('/api/anter_portal/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ partnerReference: reference || undefined }),
        }),
      ),
      context: {
        moduleId: 'anter_portal',
        entityId: 'anter_portal.order',
        operation: 'checkout',
        resourceKind: 'anter_portal.cart',
        resourceId: cart.id,
        formId: 'anter_portal.cart.checkout',
        retryLastMutation: checkoutMutation.retryLastMutation,
      },
      mutationPayload: { partnerReference: reference || undefined },
    })
    setSubmitting(false)
    if (!result.ok || !result.result) {
      if (result.status === 409) {
        const body = result.response ? await result.response.clone().json().catch(() => null) : null
        if (body?.error === 'price_changed') {
          setCheckoutError(t('anter_portal.errors.priceChanged', 'Prices changed since you last viewed your cart. Please review and try again.'))
        } else {
          setCheckoutError(t('anter_portal.cart.conflictError', 'Your cart changed elsewhere. It has been refreshed — please review and try again.'))
        }
        void loadCart()
        return
      }
      if (result.status === 403) {
        setCheckoutError(t('anter_portal.errors.orderingBlocked', 'Ordering is blocked for this account.'))
        return
      }
      setCheckoutError(t('anter_portal.cart.checkoutError', 'Could not place your order'))
      return
    }
    router.push(`/${params.orgSlug}/portal/orders/${result.result.item.orderId}?justPlaced=1`)
  }, [cart, checkoutMutation, reference, t, loadCart, router, params.orgSlug])

  if (loading || isLoading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>
  }
  if (!user) return null
  if (error || !cart) return <ErrorMessage label={error ?? t('anter_portal.cart.loadError', 'Failed to load your cart')} />

  const listValueTotal = cart.lines.reduce((sum, line) => sum + (line.listUnitPriceNet ?? 0) * line.quantity, 0)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 pt-2">
      <PortalPageHeader title={t('anter_portal.cart.title', 'Cart')} />

      {cart.lines.length === 0 ? (
        <PortalEmptyState
          icon={<ShoppingCart className="size-5" />}
          title={t('anter_portal.cart.empty', 'Your cart is empty.')}
        />
      ) : (
        <>
          <PortalCard>
            <PortalCardHeader title={t('anter_portal.cart.lines.title', 'Items')} />
            <div className="flex flex-col divide-y divide-border">
              {cart.lines.map((line) => (
                <div key={line.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{line.nameSnapshot}</p>
                    {line.sku ? <p className="text-overline text-muted-foreground">{line.sku}</p> : null}
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) => handleQuantityChange(line, Math.max(1, Number(event.target.value) || 1))}
                    className="w-20"
                  />
                  <span className="w-28 text-right font-medium text-foreground">
                    {formatMoney((line.partnerUnitPriceNet ?? 0) * line.quantity, line.currencyCode)}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={t('anter_portal.cart.remove', 'Remove')} onClick={() => handleRemoveLine(line)}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          </PortalCard>

          <PortalCard>
            <PortalCardHeader title={t('anter_portal.cart.delivery.title', 'Delivery')} />
            <div className="flex flex-col gap-4">
              <RadioGroup value={deliveryMode ?? 'self_collection'} onValueChange={(value) => setDeliveryMode(value as Cart['deliveryMode'])}>
                {DELIVERY_MODES.map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm text-foreground">
                    <Radio value={mode} />
                    {t(`anter_portal.cart.deliveryMode.${mode}`, mode)}
                  </label>
                ))}
              </RadioGroup>

              <FormField label={t('anter_portal.cart.reference.label', 'Your order number (optional)')} description={t('anter_portal.cart.reference.hint', 'Shown on your documents for internal reference.')}>
                <Input value={reference} maxLength={64} onChange={(event) => setReference(event.target.value)} />
              </FormField>

              <FormField label={t('anter_portal.cart.notes.label', 'Notes')}>
                <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
              </FormField>

              <div>
                <Button variant="secondary" onClick={handleSaveDetails}>
                  {t('anter_portal.cart.saveDetails', 'Save details')}
                </Button>
              </div>
            </div>
          </PortalCard>

          <PortalCard>
            <PortalCardHeader title={t('anter_portal.cart.summary.title', 'Summary')} />
            <div className="flex flex-col gap-1">
              <PortalStatRow label={t('anter_portal.cart.summary.listValue', 'List value')} value={formatMoney(listValueTotal, cart.currencyCode)} />
              <PortalStatRow label={t('anter_portal.cart.summary.discount', 'Partner discount')} value={`-${formatMoney(listValueTotal - cart.totals.subtotalNetAmount, cart.currencyCode)}`} />
              <PortalStatRow label={t('anter_portal.cart.summary.netLines', 'Net lines')} value={formatMoney(cart.totals.subtotalNetAmount, cart.currencyCode)} />
              <PortalStatRow label={t('anter_portal.cart.summary.shipping', 'Indicative shipping')} value={formatMoney(cart.totals.shippingNetAmount, cart.currencyCode)} />
              <PortalCardDivider />
              <PortalStatRow label={t('anter_portal.cart.summary.netTotal', 'Net total')} value={formatMoney(cart.totals.grandTotalNetAmount, cart.currencyCode)} />
              <PortalStatRow label={t('anter_portal.cart.summary.vat', 'VAT')} value={formatMoney(cart.totals.taxTotalAmount, cart.currencyCode)} />
              <PortalStatRow label={t('anter_portal.cart.summary.grossTotal', 'Gross total')} value={<span className="font-semibold text-foreground">{formatMoney(cart.totals.grandTotalGrossAmount, cart.currencyCode)}</span>} />
            </div>

            {checkoutError ? <div className="mt-4"><Alert status="error">{checkoutError}</Alert></div> : null}

            <div className="mt-4">
              <Button onClick={handlePlaceOrder} disabled={submitting || cart.lines.length === 0}>
                {submitting ? <Spinner className="mr-2 size-4" /> : null}
                {t('anter_portal.cart.placeOrder', 'Place order')}
              </Button>
            </div>
          </PortalCard>
        </>
      )}
    </div>
  )
}
