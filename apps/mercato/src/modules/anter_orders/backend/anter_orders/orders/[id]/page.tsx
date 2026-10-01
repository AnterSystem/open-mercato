"use client"

import * as React from 'react'
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

type Shipment = {
  id: string
  shipment_number: string
  status: string
  carrier_name: string | null
  tracking_number: string | null
  weight_kg: number | null
  package_count: number | null
  dispatched_at: string | null
  delivered_at: string | null
}

type Invoice = {
  id: string
  invoice_number: string
  issued_at: string | null
  net_amount: number
  gross_amount: number
  currency_code: string
}

type Allocation = {
  id: string
  order_line_id: string
  quantity: number
  status: string
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

const SHIPMENT_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  planned: 'neutral',
  dispatched: 'info',
  delivered: 'success',
}

const ALLOCATION_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  allocated: 'neutral',
  packed: 'info',
  shipped: 'info',
  released: 'warning',
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

/** Quantities are stored as numerics, so a raw render reads "8.0000". */
function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : '—'
}

export default function AnterOrderBackendDetailPage({ params }: { params?: { id?: string } }) {
  const t = useT()
  const orderId = params?.id ?? ''

  const [order, setOrder] = React.useState<Order | null>(null)
  const [lines, setLines] = React.useState<OrderLine[]>([])
  const [shipments, setShipments] = React.useState<Shipment[]>([])
  const [invoices, setInvoices] = React.useState<Invoice[]>([])
  const [allocations, setAllocations] = React.useState<Allocation[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const confirmMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.order.confirm' })
  const allocateMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.stock.allocate' })

  const loadOrder = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    const [orderRes, linesRes, shipmentsRes, invoicesRes] = await Promise.all([
      apiCall<{ items: Order[] }>(`/api/anter_orders/orders?id=${orderId}`),
      apiCall<{ items: OrderLine[] }>(`/api/anter_orders/order-lines?orderId=${orderId}&pageSize=100`),
      apiCall<{ items: Shipment[] }>(`/api/anter_orders/shipments?orderId=${orderId}&pageSize=100`),
      apiCall<{ items: Invoice[] }>(`/api/anter_orders/invoices?orderId=${orderId}&pageSize=100`),
    ])
    if (!orderRes.ok || !orderRes.result?.items?.[0]) {
      setError(t('anter_orders.orders.detail.notFound', 'Order not found'))
      setIsLoading(false)
      return
    }
    const loadedLines = linesRes.ok && linesRes.result ? linesRes.result.items : []
    setOrder(orderRes.result.items[0])
    setLines(loadedLines)
    setShipments(shipmentsRes.ok && shipmentsRes.result ? shipmentsRes.result.items : [])
    setInvoices(invoicesRes.ok && invoicesRes.result ? invoicesRes.result.items : [])

    // One request for every line's reservations rather than one per line.
    if (loadedLines.length) {
      const orderLineIds = loadedLines.map((line) => line.id).join(',')
      const allocationsRes = await apiCall<{ items: Allocation[] }>(
        `/api/anter_orders/stock-allocations?orderLineIds=${orderLineIds}&pageSize=100`,
      )
      setAllocations(allocationsRes.ok && allocationsRes.result ? allocationsRes.result.items : [])
    } else {
      setAllocations([])
    }
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

  const allocationsByLine = React.useMemo(() => {
    const map = new Map<string, Allocation[]>()
    for (const allocation of allocations) {
      const bucket = map.get(allocation.order_line_id) ?? []
      bucket.push(allocation)
      map.set(allocation.order_line_id, bucket)
    }
    return map
  }, [allocations])

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
                <span className="w-16 text-right text-sm text-muted-foreground">×{formatQuantity(line.quantity)}</span>
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

        <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('anter_orders.orders.detail.allocations', 'Allocations')}</h2>
          </div>
          {allocations.length ? (
            <div className="flex flex-col divide-y divide-border">
              {lines.map((line) => {
                const lineAllocations = allocationsByLine.get(line.id) ?? []
                if (!lineAllocations.length) return null
                return (
                  <div key={line.id} className="px-4 py-3">
                    <p className="truncate text-sm font-medium text-foreground">{line.name_snapshot}</p>
                    <div className="mt-2 flex flex-col gap-1">
                      {lineAllocations.map((allocation) => (
                        <div key={allocation.id} className="flex items-center justify-between gap-3">
                          <span className="text-sm text-muted-foreground">
                            ×{formatQuantity(allocation.quantity)}
                          </span>
                          <StatusBadge variant={ALLOCATION_STATUS_VARIANTS[allocation.status] ?? 'neutral'}>
                            {t(`anter_orders.allocationStatus.${allocation.status}`, allocation.status)}
                          </StatusBadge>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('anter_orders.orders.detail.noAllocations', 'Nothing allocated yet')}
            </p>
          )}
        </section>

        <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('anter_orders.orders.detail.shipments', 'Shipments')}</h2>
          </div>
          {shipments.length ? (
            <div className="flex flex-col divide-y divide-border">
              {shipments.map((shipment) => (
                <div key={shipment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{shipment.shipment_number}</p>
                    <p className="text-overline text-muted-foreground">
                      {shipment.carrier_name ?? '—'}
                      {shipment.tracking_number ? ` — ${shipment.tracking_number}` : ''}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{formatDate(shipment.dispatched_at)}</span>
                  <StatusBadge variant={SHIPMENT_STATUS_VARIANTS[shipment.status] ?? 'neutral'}>
                    {t(`anter_orders.shipmentStatus.${shipment.status}`, shipment.status)}
                  </StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('anter_orders.orders.detail.noShipments', 'No shipments yet')}
            </p>
          )}
        </section>

        <section className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">{t('anter_orders.orders.detail.invoice', 'Invoices')}</h2>
          </div>
          {invoices.length ? (
            <div className="flex flex-col divide-y divide-border">
              {invoices.map((invoice) => (
                <div key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="font-medium text-foreground">{invoice.invoice_number}</span>
                  <span className="text-sm text-muted-foreground">{formatDate(invoice.issued_at)}</span>
                  <span className="font-medium text-foreground">
                    {formatMoney(invoice.gross_amount, invoice.currency_code || order.currency_code)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('anter_orders.orders.detail.noInvoice', 'Not invoiced yet')}
            </p>
          )}
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
