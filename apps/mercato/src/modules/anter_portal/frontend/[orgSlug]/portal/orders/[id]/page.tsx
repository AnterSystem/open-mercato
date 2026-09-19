"use client"

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Check, Download } from 'lucide-react'
import { useT, useLocale } from '@open-mercato/shared/lib/i18n/context'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { usePortalAppEvent } from '@open-mercato/ui/portal/hooks/usePortalAppEvent'
import { PortalCard, PortalCardHeader, PortalCardDivider, PortalStatRow } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string; id: string } }

type OrderLine = {
  id: string
  lineNumber: number
  nameSnapshot: string
  sku: string | null
  quantity: number
  unitPriceNet: number
  netAmount: number
  grossAmount: number
  lineStatus: string
  shippedQuantity: number
  expectedAt: string | null
}

type Shipment = {
  id: string
  shipmentNumber: string
  status: string
  carrierName: string | null
  trackingNumber: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
}

type Invoice = {
  id: string
  invoiceNumber: string
  issuedAt: string
}

type Order = {
  id: string
  orderNumber: string
  status: string
  currencyCode: string
  deliveryMode: string
  subtotalNetAmount: number
  discountTotalAmount: number
  shippingNetAmount: number
  taxTotalAmount: number
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
  partnerReference: string | null
  notes: string | null
  placedAt: string | null
  lines: OrderLine[]
  shipments: Shipment[]
  invoice: Invoice | null
}

const TIMELINE_STEPS = ['placed', 'confirmed', 'awaiting_stock', 'picking', 'shipped_partially', 'shipped', 'delivered'] as const

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

export default function AnterPortalOrderDetailPage({ params }: Props) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [order, setOrder] = React.useState<Order | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const justPlaced = searchParams?.get('justPlaced') === '1'

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  const loadOrder = React.useCallback(async () => {
    const res = await apiCall<{ item: Order }>(`/api/anter_portal/orders/${params.id}`)
    if (!res.ok || !res.result) {
      setError(res.status === 404
        ? t('anter_portal.orders.detail.notFound', 'Order not found')
        : t('anter_portal.orders.detail.loadError', 'Failed to load this order'))
      return
    }
    setOrder(res.result.item)
  }, [params.id, t])

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    setIsLoading(true)
    loadOrder()
      .catch(() => {
        if (!cancelled) setError(t('anter_portal.orders.detail.loadError', 'Failed to load this order'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, loadOrder, t])

  // Portal SSE (spec Implementation Plan step 35): a status change lands
  // without a reload — anter_orders' order.placed/shipped_partially/shipped
  // events all carry portalBroadcast: true.
  usePortalAppEvent('anter_orders.order.*', (payload) => {
    if ((payload as { id?: string })?.id === params.id) void loadOrder()
  }, [loadOrder, params.id])

  if (loading || isLoading) return <LoadingMessage label={t('anter_portal.orders.detail.loading', 'Loading order…')} />
  if (!user) return null
  if (error || !order) return <ErrorMessage label={error ?? t('anter_portal.orders.detail.loadError', 'Failed to load this order')} />

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-2">
      {justPlaced ? (
        <Alert status="success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" />
            {order.partnerReference
              ? t('anter_portal.orders.detail.confirmationWithReference', 'Your order {orderNumber} ({reference}) has been placed.')
                  .replace('{orderNumber}', order.orderNumber)
                  .replace('{reference}', order.partnerReference)
              : t('anter_portal.orders.detail.confirmation', 'Your order {orderNumber} has been placed.').replace('{orderNumber}', order.orderNumber)}
          </div>
        </Alert>
      ) : null}

      <div>
        <h1 className="text-2xl font-bold tracking-tight">{order.orderNumber}</h1>
        {order.partnerReference ? <p className="text-sm text-muted-foreground">{order.partnerReference}</p> : null}
        <div className="mt-2">
          <StatusBadge variant={ORDER_STATUS_VARIANTS[order.status] ?? 'neutral'}>
            {t(`anter_portal.orderStatus.${order.status}`, order.status)}
          </StatusBadge>
        </div>
      </div>

      <PortalCard>
        <PortalCardHeader title={t('anter_portal.orders.detail.timeline', 'Status')} />
        <ol className="flex flex-wrap items-center gap-2">
          {TIMELINE_STEPS.map((step, index) => {
            const currentIndex = TIMELINE_STEPS.indexOf(order.status as typeof TIMELINE_STEPS[number])
            const isCurrent = step === order.status
            const isDone = currentIndex >= 0 && index < currentIndex
            return (
              <li key={step} className="flex items-center gap-2">
                <span className={`flex size-6 items-center justify-center rounded-full text-overline ${
                  isCurrent ? 'bg-accent-indigo text-white' : isDone ? 'bg-status-success-bg text-status-success-text' : 'bg-muted text-muted-foreground'
                }`}>
                  {isDone ? <Check className="size-3.5" /> : index + 1}
                </span>
                <span className={`text-sm ${isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                  {t(`anter_portal.orderStatus.${step}`, step)}
                </span>
                {index < TIMELINE_STEPS.length - 1 ? <span className="h-px w-4 bg-border" aria-hidden="true" /> : null}
              </li>
            )
          })}
        </ol>
      </PortalCard>

      {order.shipments.length > 0 || order.invoice ? (
        <PortalCard>
          <PortalCardHeader title={t('anter_portal.orders.detail.documents', 'Shipments and documents')} />
          <div className="flex flex-col gap-3">
            {order.shipments.map((shipment) => (
              <div key={shipment.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{shipment.shipmentNumber}</span>
                <StatusBadge variant={shipment.status === 'delivered' ? 'success' : shipment.status === 'dispatched' ? 'info' : 'neutral'}>
                  {shipment.status}
                </StatusBadge>
                {shipment.trackingNumber ? (
                  <span className="text-muted-foreground">{shipment.carrierName ? `${shipment.carrierName} — ` : ''}{shipment.trackingNumber}</span>
                ) : null}
              </div>
            ))}
            {order.invoice ? (
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{order.invoice.invoiceNumber}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Download className="size-4" aria-hidden="true" />
                  {new Date(order.invoice.issuedAt).toLocaleDateString(locale || undefined)}
                </span>
              </div>
            ) : null}
          </div>
        </PortalCard>
      ) : null}

      <PortalCard>
        <PortalCardHeader
          title={t('anter_portal.orders.detail.lines', 'Lines')}
          action={(
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                const res = await apiCall<{ item: unknown }>('/api/anter_portal/cart/reorder', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({ orderId: order.id }),
                })
                if (!res.ok) {
                  flash(t('anter_portal.orders.reorderError', 'Could not reorder'), 'error')
                  return
                }
                flash(t('anter_portal.orders.reorderSuccess', 'Added to your cart'), 'success')
                router.push(`/${params.orgSlug}/portal/cart`)
              }}
            >
              {t('anter_portal.orders.reorder', 'Ponów')}
            </Button>
          )}
        />
        <div className="flex flex-col divide-y divide-border">
          {order.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{line.nameSnapshot}</p>
                {line.sku ? <p className="text-overline text-muted-foreground">{line.sku}</p> : null}
                {line.lineStatus === 'awaiting_stock' && line.expectedAt ? (
                  <p className="text-overline text-muted-foreground">
                    {t('anter_portal.orders.detail.expectedAt', 'Expected {date}').replace('{date}', new Date(line.expectedAt).toLocaleDateString(locale || undefined))}
                  </p>
                ) : null}
              </div>
              <span className="w-16 text-right text-sm text-muted-foreground">×{line.quantity}</span>
              <span className="w-28 text-right font-medium text-foreground">{formatMoney(line.grossAmount, order.currencyCode)}</span>
              <StatusBadge variant={LINE_STATUS_VARIANTS[line.lineStatus] ?? 'neutral'}>
                {t(`anter_portal.lineStatus.${line.lineStatus}`, line.lineStatus)}
              </StatusBadge>
            </div>
          ))}
        </div>
      </PortalCard>

      <PortalCard>
        <PortalCardHeader title={t('anter_portal.orders.detail.summary', 'Summary')} />
        <div className="flex flex-col gap-1">
          <PortalStatRow label={t('anter_portal.cart.summary.netLines', 'Net lines')} value={formatMoney(order.subtotalNetAmount, order.currencyCode)} />
          <PortalStatRow label={t('anter_portal.cart.summary.shipping', 'Indicative shipping')} value={formatMoney(order.shippingNetAmount, order.currencyCode)} />
          <PortalCardDivider />
          <PortalStatRow label={t('anter_portal.cart.summary.netTotal', 'Net total')} value={formatMoney(order.grandTotalNetAmount, order.currencyCode)} />
          <PortalStatRow label={t('anter_portal.cart.summary.vat', 'VAT')} value={formatMoney(order.taxTotalAmount, order.currencyCode)} />
          <PortalStatRow label={t('anter_portal.cart.summary.grossTotal', 'Gross total')} value={<span className="font-semibold text-foreground">{formatMoney(order.grandTotalGrossAmount, order.currencyCode)}</span>} />
        </div>
      </PortalCard>
    </div>
  )
}
