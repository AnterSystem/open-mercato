"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OrderLine = {
  id: string
  name_snapshot: string
  sku: string | null
  quantity: number
  shipped_quantity: number
  line_status: string
}

type Order = {
  id: string
  order_number: string
  currency_code: string
  shipping_net_amount: number | string
  updatedAt: string
}

const LINE_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  awaiting_stock: 'info',
  allocated: 'neutral',
  packed: 'info',
  shipped: 'info',
  delivered: 'success',
}

function formatMoney(value: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

export default function AnterReleaseDetailPage({ params }: { params?: { orderId?: string } }) {
  const t = useT()
  const router = useRouter()
  const orderId = params?.orderId ?? ''

  const [order, setOrder] = React.useState<Order | null>(null)
  const [lines, setLines] = React.useState<OrderLine[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [selected, setSelected] = React.useState<Record<string, number>>({})
  const [weightKg, setWeightKg] = React.useState('')
  const [packageCount, setPackageCount] = React.useState('')
  const [shippingCostNet, setShippingCostNet] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const createMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.shipment.create' })

  React.useEffect(() => {
    if (!orderId) return
    let cancelled = false
    setIsLoading(true)
    Promise.all([
      apiCall<{ items: Order[] }>(`/api/anter_orders/orders?id=${orderId}`),
      apiCall<{ items: OrderLine[] }>(`/api/anter_orders/order-lines?orderId=${orderId}&pageSize=100`),
    ]).then(([orderRes, linesRes]) => {
      if (cancelled) return
      if (!orderRes.ok || !orderRes.result?.items?.[0]) {
        setError(t('anter_orders.releases.detail.notFound', 'Order not found'))
        return
      }
      setOrder(orderRes.result.items[0])
      setLines(linesRes.ok && linesRes.result ? linesRes.result.items : [])
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orderId, t])

  const shippableLines = React.useMemo(
    () => lines.filter((line) => line.line_status !== 'awaiting_stock' && line.shipped_quantity < line.quantity),
    [lines],
  )

  const toggleLine = (line: OrderLine, checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (checked) next[line.id] = line.quantity - line.shipped_quantity
      else delete next[line.id]
      return next
    })
  }

  const selectedLineCount = Object.keys(selected).length
  // The API serialises numeric columns as strings, so every arithmetic use of
  // shipping_net_amount has to coerce first or the split-cost figures render NaN.
  const quotedShippingNet = Number(order?.shipping_net_amount) || 0
  const remainderEstimate = order ? Math.max(0, quotedShippingNet - (Number(shippingCostNet) || 0)) : 0
  const difference = order ? (Number(shippingCostNet) || 0) - quotedShippingNet : 0

  const handleSubmit = React.useCallback(async () => {
    if (!order || !selectedLineCount) return
    setSubmitting(true)
    const result = await createMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(order.updatedAt),
        () => apiCall<{ item: unknown }>('/api/anter_orders/shipments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            orderId: order.id,
            weightKg: weightKg ? Number(weightKg) : undefined,
            packageCount: packageCount ? Number(packageCount) : undefined,
            shippingCostNet: shippingCostNet ? Number(shippingCostNet) : undefined,
            lines: Object.entries(selected).map(([orderLineId, quantity]) => ({ orderLineId, quantity })),
          }),
        }),
      ),
      context: {
        moduleId: 'anter_orders',
        entityId: 'anter_orders.shipment',
        operation: 'create',
        resourceKind: 'anter_orders.order',
        resourceId: order.id,
        formId: 'anter_orders.shipment.create',
        retryLastMutation: createMutation.retryLastMutation,
      },
      mutationPayload: { orderId: order.id },
    })
    setSubmitting(false)
    if (!result.ok || !result.result) {
      flash(t('anter_orders.releases.createError', 'Could not create this shipment'), 'error')
      return
    }
    flash(t('anter_orders.releases.createSuccess', 'Shipment created'), 'success')
    router.push(`/backend/anter_orders/orders/${order.id}`)
  }, [order, selected, selectedLineCount, weightKg, packageCount, shippingCostNet, createMutation, t, router])

  if (isLoading) return <LoadingMessage label={t('anter_orders.releases.detail.loading', 'Loading order…')} />
  if (error || !order) return <ErrorMessage label={error ?? t('anter_orders.releases.detail.notFound', 'Order not found')} />

  return (
    <Page>
      <PageBody>
        <h1 className="mb-4 text-2xl font-bold tracking-tight">{order.order_number}</h1>

        <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('anter_orders.releases.detail.selectLines', 'Select lines to ship')}</h2>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {shippableLines.map((line) => {
              const remaining = line.quantity - line.shipped_quantity
              const isSelected = line.id in selected
              return (
                <div key={line.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox checked={isSelected} onCheckedChange={(checked) => toggleLine(line, checked === true)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{line.name_snapshot}</p>
                    {line.sku ? <p className="text-overline text-muted-foreground">{line.sku}</p> : null}
                  </div>
                  <StatusBadge variant={LINE_STATUS_VARIANTS[line.line_status] ?? 'neutral'}>
                    {t(`anter_portal.lineStatus.${line.line_status}`, line.line_status)}
                  </StatusBadge>
                  <Input
                    type="number"
                    min={1}
                    max={remaining}
                    disabled={!isSelected}
                    value={selected[line.id] ?? remaining}
                    onChange={(event) => setSelected((prev) => ({ ...prev, [line.id]: Math.min(remaining, Math.max(1, Number(event.target.value) || 1)) }))}
                    className="w-24"
                  />
                  <span className="w-16 text-right text-sm text-muted-foreground">/ {remaining}</span>
                </div>
              )
            })}
            {shippableLines.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t('anter_orders.releases.detail.noLines', 'No lines are ready to ship')}</div>
            ) : null}
          </div>
        </section>

        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('anter_orders.releases.detail.summary', 'Shipment summary')}</h2>
            <div className="flex flex-col gap-3">
              <FormField label={t('anter_orders.releases.detail.weight', 'Weight (kg)')}>
                <Input type="number" min={0} value={weightKg} onChange={(event) => setWeightKg(event.target.value)} />
              </FormField>
              <FormField label={t('anter_orders.releases.detail.packages', 'Packages')}>
                <Input type="number" min={0} value={packageCount} onChange={(event) => setPackageCount(event.target.value)} />
              </FormField>
              <FormField label={t('anter_orders.releases.detail.shippingCost', 'This shipment\'s cost')}>
                <Input type="number" min={0} value={shippingCostNet} onChange={(event) => setShippingCostNet(event.target.value)} />
              </FormField>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">{t('anter_orders.releases.detail.costComparison', 'Split-cost comparison')}</h2>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('anter_orders.releases.detail.quotedShipping', 'Quoted shipping (whole order)')}</span><span>{formatMoney(quotedShippingNet, order.currency_code)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('anter_orders.releases.detail.thisShipment', 'This shipment')}</span><span>{formatMoney(Number(shippingCostNet) || 0, order.currency_code)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('anter_orders.releases.detail.remainderEstimate', 'Estimated remainder')}</span><span>{formatMoney(remainderEstimate, order.currency_code)}</span></div>
              <div className="flex justify-between font-medium"><span>{t('anter_orders.releases.detail.difference', 'Difference vs quote')}</span><span className={difference > 0 ? 'text-status-error-text' : ''}>{formatMoney(difference, order.currency_code)}</span></div>
            </div>
          </section>
        </div>

        <Button onClick={handleSubmit} disabled={submitting || selectedLineCount === 0}>
          {t('anter_orders.releases.detail.createShipment', 'Create shipment')}
        </Button>
      </PageBody>
    </Page>
  )
}
