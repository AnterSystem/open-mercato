"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Package } from 'lucide-react'
import { useT, useLocale } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'

type Props = { params: { orgSlug: string } }

type OrderRow = {
  id: string
  orderNumber: string
  status: string
  currencyCode: string
  grandTotalGrossAmount: number
  partnerReference: string | null
  placedAt: string | null
}

type OrderListResponse = { items: OrderRow[]; total: number; page: number; pageSize: number }

const ORDER_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  placed: 'neutral',
  confirmed: 'info',
  picking: 'info',
  awaiting_stock: 'info',
  shipped_partially: 'warning',
  shipped: 'info',
  delivered: 'success',
}

function formatMoney(value: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

export default function AnterPortalOrdersPage({ params }: Props) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [rows, setRows] = React.useState<OrderRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    setIsLoading(true)
    apiCall<OrderListResponse>(`/api/anter_portal/orders?page=${page}&pageSize=${pageSize}`)
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.result) {
          setError(t('anter_portal.orders.loadError', 'Failed to load your orders'))
          return
        }
        setRows(res.result.items)
        setTotal(res.result.total)
      })
      .catch(() => {
        if (!cancelled) setError(t('anter_portal.orders.loadError', 'Failed to load your orders'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, page, pageSize, t])

  const columns = React.useMemo<ColumnDef<OrderRow>[]>(() => [
    {
      id: 'orderNumber',
      header: t('anter_portal.orders.column.number', 'Order'),
      cell: ({ row }) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-foreground">{row.original.orderNumber}</span>
          {row.original.partnerReference ? (
            <span className="block text-overline text-muted-foreground">{row.original.partnerReference}</span>
          ) : null}
        </span>
      ),
      meta: { maxWidth: 260 },
    },
    {
      accessorKey: 'status',
      header: t('anter_portal.orders.column.status', 'Status'),
      cell: ({ row }) => (
        <StatusBadge variant={ORDER_STATUS_VARIANTS[row.original.status] ?? 'neutral'}>
          {t(`anter_portal.orderStatus.${row.original.status}`, row.original.status)}
        </StatusBadge>
      ),
      meta: { maxWidth: 180 },
    },
    {
      id: 'placedAt',
      header: t('anter_portal.orders.column.placedAt', 'Placed'),
      cell: ({ row }) => row.original.placedAt
        ? new Date(row.original.placedAt).toLocaleDateString(locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : '—',
      meta: { maxWidth: 160 },
    },
    {
      id: 'total',
      header: t('anter_portal.orders.column.total', 'Total'),
      cell: ({ row }) => formatMoney(row.original.grandTotalGrossAmount, row.original.currencyCode),
      meta: { maxWidth: 140 },
    },
  ], [t, locale])

  if (loading) return <div className="flex items-center justify-center py-20"><Spinner /></div>
  if (!user) return null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pt-2">
      <PortalPageHeader title={t('anter_portal.orders.title', 'Orders')} />

      {error ? <ErrorMessage label={error} /> : null}

      {!isLoading && rows.length === 0 ? (
        <PortalEmptyState
          icon={<Package className="size-5" />}
          title={t('anter_portal.orders.empty.title', 'No orders yet')}
          description={t('anter_portal.orders.empty.description', 'Orders you place from the catalogue will show up here.')}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <DataTable<OrderRow>
            embedded
            columns={columns}
            data={rows}
            isLoading={isLoading}
            onRowClick={(row) => router.push(`/${params.orgSlug}/portal/orders/${row.id}`)}
            pagination={{
              page,
              pageSize,
              total,
              totalPages: Math.max(1, Math.ceil(total / pageSize)),
              onPageChange: setPage,
              onPageSizeChange: () => {},
            }}
          />
        </section>
      )}
    </div>
  )
}
