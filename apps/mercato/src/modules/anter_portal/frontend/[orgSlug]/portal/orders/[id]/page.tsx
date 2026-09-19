"use client"

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { useT, useLocale } from '@open-mercato/shared/lib/i18n/context'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
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

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    setIsLoading(true)
    apiCall<{ item: Order }>(`/api/anter_portal/orders/${params.id}`)
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.result) {
          setError(res.status === 404
            ? t('anter_portal.orders.detail.notFound', 'Order not found')
            : t('anter_portal.orders.detail.loadError', 'Failed to load this order'))
          return
        }
        setOrder(res.result.item)
      })
      .catch(() => {
        if (!cancelled) setError(t('anter_portal.orders.detail.loadError', 'Failed to load this order'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, params.id, t])

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
        <PortalCardHeader title={t('anter_portal.orders.detail.lines', 'Lines')} />
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
