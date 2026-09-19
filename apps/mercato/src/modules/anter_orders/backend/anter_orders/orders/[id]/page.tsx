"use client"

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OrderLine = {
  id: string
  line_number: number
  sku: string | null
  name_snapshot: string
  quantity: number
  net_amount: number
  fulfilment_mode: string
  line_status: string
  expected_at: string | null
}

type Order = {
  id: string
  order_number: string
  status: string
  currency_code: string
  partner_reference: string | null
  grand_total_net_amount: number
  grand_total_gross_amount: number
  updatedAt: string
}

const ORDER_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  placed: 'neutral',
  confirmed: 'info',
  picking: 'info',
  awaiting_stock: 'info',
  shipped_partially: 'warning',
  shipped: 'info',
  delivered: 'success',
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

export default function AnterOrderBackendDetailPage() {
  const t = useT()
  const params = useParams<{ id: string }>()
  const orderId = params?.id as string

  const [order, setOrder] = React.useState<Order | null>(null)
  const [lines, setLines] = React.useState<OrderLine[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const confirmMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.order.confirm' })
  const allocateMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.stock.allocate' })

  const loadOrder = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [orderRes, linesRes] = await Promise.all([
      apiCall<{ items: Order[] }>(`/api/anter_orders/orders?id=${orderId}`),
      apiCall<{ items: OrderLine[] }>(`/api/anter_orders/order-lines?orderId=${orderId}&pageSize=100`),
    ])
    if (!orderRes.ok || !orderRes.result?.items?.[0]) {
      setError(t('anter_orders.orders.detail.notFound', 'Order not found'))
      setIsLoading(false)
      return
    }
    setOrder(orderRes.result.items[0])
    setLines(linesRes.ok && linesRes.result ? linesRes.result.items : [])
    setIsLoading(false)
  }, [orderId, t])

  React.useEffect(() => {
    if (orderId) void loadOrder()
  }, [orderId, loadOrder])

  const handleConfirm = React.useCallback(async () => {
    if (!order) return
    const result = await confirmMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(order.updatedAt),
        () => apiCall<{ item: unknown }>(`/api/anter_orders/orders/${order.id}/confirm`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({}),
        }),
      ),
      context: {
        moduleId: 'anter_orders',
        entityId: 'anter_orders.order',
        operation: 'confirm',
        resourceKind: 'anter_orders.order',
        resourceId: order.id,
        formId: 'anter_orders.order.confirm',
        retryLastMutation: confirmMutation.retryLastMutation,
      },
      mutationPayload: {},
    })
    if (!result.ok || !result.result) {
      flash(t('anter_orders.orders.confirmError', 'Could not confirm this order'), 'error')
      return
    }
    flash(t('anter_orders.orders.confirmSuccess', 'Order confirmed'), 'success')
    void loadOrder()
  }, [order, confirmMutation, t, loadOrder])

  const handleAllocate = React.useCallback(async (line: OrderLine) => {
    const result = await allocateMutation.runMutation({
      operation: () => apiCall<{ item: unknown }>(`/api/anter_orders/order-lines/${line.id}/allocate`, {
        method: 'POST',
        credentials: 'include',
      }),
      context: {
        moduleId: 'anter_orders',
        entityId: 'anter_orders.order_line',
        operation: 'allocate',
        resourceKind: 'anter_orders.order',
        resourceId: orderId,
        formId: 'anter_orders.stock.allocate',
        retryLastMutation: allocateMutation.retryLastMutation,
      },
      mutationPayload: { orderLineId: line.id },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_orders.fulfilment.allocateError', 'Could not allocate this line'), 'error')
      return
    }
    flash(t('anter_orders.fulfilment.allocateSuccess', 'Allocated'), 'success')
    void loadOrder()
  }, [allocateMutation, orderId, t, loadOrder])

  if (isLoading) return <LoadingMessage label={t('anter_orders.orders.detail.loading', 'Loading order…')} />
  if (error || !order) return <ErrorMessage label={error ?? t('anter_orders.orders.detail.loadError', 'Failed to load this order')} />

  return (
    <Page>
      <PageBody>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{order.order_number}</h1>
            {order.partner_reference ? <p className="text-sm text-muted-foreground">{order.partner_reference}</p> : null}
            <div className="mt-2">
              <StatusBadge variant={ORDER_STATUS_VARIANTS[order.status] ?? 'neutral'}>
                {t(`anter_portal.orderStatus.${order.status}`, order.status)}
              </StatusBadge>
            </div>
          </div>
          {order.status === 'placed' || order.status === 'awaiting_stock' ? (
            <Button onClick={handleConfirm}>{t('anter_orders.orders.confirm', 'Confirm order')}</Button>
          ) : null}
        </div>

        <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('anter_orders.orders.detail.lines', 'Lines')}</h2>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{line.name_snapshot}</p>
                  {line.sku ? <p className="text-overline text-muted-foreground">{line.sku}</p> : null}
                </div>
                <span className="w-16 text-right text-sm text-muted-foreground">×{line.quantity}</span>
                <span className="w-28 text-right font-medium text-foreground">{formatMoney(line.net_amount, order.currency_code)}</span>
                <StatusBadge variant={LINE_STATUS_VARIANTS[line.line_status] ?? 'neutral'}>
                  {t(`anter_portal.lineStatus.${line.line_status}`, line.line_status)}
                </StatusBadge>
                {line.line_status === 'awaiting_stock' ? (
                  <Button size="sm" variant="secondary" onClick={() => handleAllocate(line)}>
                    {t('anter_orders.fulfilment.allocate', 'Allocate')}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t('anter_orders.orders.column.total', 'Net value')}</span>
            <span className="font-semibold text-foreground">{formatMoney(order.grand_total_net_amount, order.currency_code)}</span>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
