"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Input } from '@open-mercato/ui/primitives/input'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string; productId: string } }

type Availability =
  | { status: 'in_stock' }
  | { status: 'expected'; expectedRestockAt: string | null }
  | { status: 'quote_only' }

type VariantRow = {
  productId: string
  variantId: string
  variantName: string | null
  title: string
  sku: string | null
  currencyCode: string
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number | null
  availability: Availability
}

type ProductDetail = {
  productId: string
  title: string
  description: string | null
  sku: string | null
  variants: VariantRow[]
}

function formatMoney(value: number | null, currencyCode: string): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

export default function AnterPortalCatalogDetailPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [detail, setDetail] = React.useState<ProductDetail | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [variantId, setVariantId] = React.useState<string>('')
  const [quantity, setQuantity] = React.useState(1)

  const addToCart = useGuardedMutation<Record<string, unknown>>({
    contextId: 'anter_portal.catalog.detail.addToCart',
    blockedMessage: t('anter_portal.catalog.addBlocked', 'Adding to cart is blocked'),
  })

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    setIsLoading(true)
    apiCall<{ item: ProductDetail }>(`/api/anter_portal/catalog/${params.productId}`)
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.result) {
          setError(t('anter_portal.catalog.detail.loadError', 'Failed to load this product'))
          return
        }
        setDetail(res.result.item)
        setVariantId(res.result.item.variants[0]?.variantId ?? '')
      })
      .catch(() => {
        if (!cancelled) setError(t('anter_portal.catalog.detail.loadError', 'Failed to load this product'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, params.productId, t])

  const selectedVariant = detail?.variants.find((variant) => variant.variantId === variantId) ?? null

  const handleAddToCart = React.useCallback(async () => {
    if (!detail || !selectedVariant) return
    const productVariantId = selectedVariant.variantId === detail.productId ? null : selectedVariant.variantId
    const result = await addToCart.runMutation({
      operation: () => apiCall<{ item: unknown }>('/api/anter_portal/cart/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: detail.productId, productVariantId, quantity }),
      }),
      context: {
        moduleId: 'anter_portal',
        entityId: 'anter_portal.cart_line',
        operation: 'add_to_cart',
        resourceKind: 'anter_portal.cart',
        formId: 'anter_portal.catalog.detail.addToCart',
        retryLastMutation: addToCart.retryLastMutation,
      },
      mutationPayload: { productId: detail.productId, productVariantId, quantity },
    })
    if (!result.ok || !result.result) {
      const message = result.status === 409
        ? t('anter_portal.errors.outOfStock', 'Not enough stock available for this item.')
        : t('anter_portal.catalog.addError', 'Could not add this item to the cart')
      flash(message, 'error')
      return
    }
    flash(t('anter_portal.catalog.addSuccess', 'Added to cart'), 'success')
  }, [addToCart, detail, selectedVariant, quantity, t])

  if (loading || isLoading) return <LoadingMessage label={t('anter_portal.catalog.detail.loading', 'Loading product…')} />
  if (!user) return null
  if (error || !detail) return <ErrorMessage label={error ?? t('anter_portal.catalog.detail.loadError', 'Failed to load this product')} />

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{detail.title}</h1>
        {detail.sku ? <p className="text-sm text-muted-foreground">{detail.sku}</p> : null}
      </div>

      {detail.description ? <p className="text-sm text-muted-foreground">{detail.description}</p> : null}

      <PortalCard>
        <div className="flex flex-col gap-4">
          {detail.variants.length > 1 ? (
            <FormField label={t('anter_portal.catalog.detail.variant', 'Variant')}>
              <Select value={variantId} onValueChange={setVariantId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {detail.variants.map((variant) => (
                    <SelectItem key={variant.variantId} value={variant.variantId}>
                      {variant.variantName ?? variant.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}

          {selectedVariant ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{t('anter_portal.catalog.column.listPrice', 'List price')}: {formatMoney(selectedVariant.listUnitPriceNet, selectedVariant.currencyCode)}</p>
                <p className="text-lg font-semibold text-foreground">{formatMoney(selectedVariant.partnerUnitPriceNet, selectedVariant.currencyCode)}</p>
              </div>
              {selectedVariant.availability.status === 'in_stock' ? (
                <StatusBadge variant="success">{t('anter_portal.catalog.availability.inStock', 'In stock')}</StatusBadge>
              ) : selectedVariant.availability.status === 'expected' ? (
                <StatusBadge variant="info">{t('anter_portal.catalog.availability.expected', 'On order')}</StatusBadge>
              ) : (
                <StatusBadge variant="neutral">{t('anter_portal.catalog.quoteOnly', 'Quote only')}</StatusBadge>
              )}
            </div>
          ) : null}

          <FormField label={t('anter_portal.catalog.detail.quantity', 'Quantity')}>
            <Input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              className="w-32"
            />
          </FormField>

          <Button
            disabled={!selectedVariant || selectedVariant.availability.status === 'quote_only'}
            onClick={handleAddToCart}
          >
            {t('anter_portal.catalog.addToCart', 'Add to cart')}
          </Button>
        </div>
      </PortalCard>
    </div>
  )
}
