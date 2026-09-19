"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterBar'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'

type OrderRow = {
  id: string
  order_number: string
  customer_entity_id: string
  source: string
  status: string
  currency_code: string
  partner_reference: string | null
  grand_total_net_amount: number
  placed_at: string | null
}

type OrderListResponse = { items: OrderRow[]; total: number; page: number; pageSize: number; totalPages: number }
type CompanyListResponse = { items: Array<{ id: string; name: string }> }

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  placed: 'neutral',
  confirmed: 'info',
  picking: 'info',
  awaiting_stock: 'info',
  shipped_partially: 'warning',
  shipped: 'info',
  delivered: 'success',
}

const STATUS_OPTIONS = Object.keys(STATUS_VARIANTS)

function formatMoney(value: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

export default function AnterOrdersBackendListPage() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()

  const [rows, setRows] = React.useState<OrderRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [filterValues, setFilterValues] = React.useState<FilterValues>({})
  const [partnerNames, setPartnerNames] = React.useState<Record<string, string>>({})

  const statusFilter = typeof filterValues.status === 'string' ? filterValues.status : ''

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (statusFilter) query.set('status', statusFilter)
    apiCall<OrderListResponse>(`/api/anter_orders/orders?${query.toString()}`)
      .then((res) => {
        if (cancelled || !res.ok || !res.result) return
        setRows(res.result.items)
        setTotal(res.result.total)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, pageSize, statusFilter])

  React.useEffect(() => {
    const missing = Array.from(new Set(rows.map((row) => row.customer_entity_id))).filter((id) => !(id in partnerNames))
    if (!missing.length) return
    apiCall<CompanyListResponse>(`/api/customers/companies?ids=${missing.join(',')}&pageSize=${missing.length}`)
      .then((res) => {
        if (!res.ok || !res.result) return
        setPartnerNames((prev) => {
          const next = { ...prev }
          for (const company of res.result!.items) next[company.id] = company.name
          return next
        })
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  const filteredRows = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) =>
      row.order_number.toLowerCase().includes(term) || (row.partner_reference ?? '').toLowerCase().includes(term))
  }, [rows, search])

  const filters = React.useMemo<FilterDef[]>(() => [
    {
      id: 'status',
      label: t('anter_orders.orders.filter.status', 'Status'),
      type: 'select',
      options: STATUS_OPTIONS.map((status) => ({ value: status, label: t(`anter_portal.orderStatus.${status}`, status) })),
    },
  ], [t])

  const columns = React.useMemo<ColumnDef<OrderRow>[]>(() => [
    {
      id: 'orderNumber',
      header: t('anter_orders.orders.column.number', 'Order'),
      cell: ({ row }) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-foreground">{row.original.order_number}</span>
          {row.original.partner_reference ? (
            <span className="block text-overline text-muted-foreground">{row.original.partner_reference}</span>
          ) : null}
        </span>
      ),
      meta: { maxWidth: 260 },
    },
    {
      id: 'partner',
      header: t('anter_orders.orders.column.partner', 'Partner'),
      cell: ({ row }) => partnerNames[row.original.customer_entity_id] ?? row.original.customer_entity_id,
      meta: { truncate: true, maxWidth: 220 },
    },
    {
      accessorKey: 'source',
      header: t('anter_orders.orders.column.source', 'Source'),
      meta: { maxWidth: 140 },
    },
    {
      accessorKey: 'status',
      header: t('anter_orders.orders.column.status', 'Status'),
      cell: ({ row }) => (
        <StatusBadge variant={STATUS_VARIANTS[row.original.status] ?? 'neutral'}>
          {t(`anter_portal.orderStatus.${row.original.status}`, row.original.status)}
        </StatusBadge>
      ),
      meta: { maxWidth: 180 },
    },
    {
      id: 'placedAt',
      header: t('anter_orders.orders.column.placedAt', 'Placed'),
      cell: ({ row }) => row.original.placed_at
        ? new Date(row.original.placed_at).toLocaleDateString(locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : '—',
      meta: { maxWidth: 160 },
    },
    {
      id: 'total',
      header: t('anter_orders.orders.column.total', 'Net value'),
      cell: ({ row }) => formatMoney(row.original.grand_total_net_amount, row.original.currency_code),
      meta: { maxWidth: 140 },
    },
  ], [t, locale, partnerNames])

  const kpis = React.useMemo(() => {
    const awaitingStock = rows.filter((row) => row.status === 'awaiting_stock').length
    const netTotal = rows.reduce((sum, row) => sum + row.grand_total_net_amount, 0)
    return { count: total, awaitingStock, netTotal }
  }, [rows, total])

  return (
    <Page>
      <PageBody>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-overline text-muted-foreground">{t('anter_orders.orders.kpi.total', 'Orders')}</p>
            <p className="text-2xl font-semibold text-foreground">{kpis.count}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-overline text-muted-foreground">{t('anter_orders.orders.kpi.awaitingStock', 'Awaiting stock')}</p>
            <p className="text-2xl font-semibold text-foreground">{kpis.awaitingStock}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-overline text-muted-foreground">{t('anter_orders.orders.kpi.netTotal', 'Net value (page)')}</p>
            <p className="text-2xl font-semibold text-foreground">{formatMoney(kpis.netTotal, rows[0]?.currency_code ?? 'PLN')}</p>
          </div>
        </div>

        <DataTable<OrderRow>
          columns={columns}
          data={filteredRows}
          isLoading={isLoading}
          entityId="anter_orders.order"
          filters={filters}
          onFiltersApply={setFilterValues}
          onFiltersClear={() => setFilterValues({})}
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('anter_orders.orders.searchPlaceholder', 'Search by order number or partner reference')}
          onRowClick={(row) => router.push(`/backend/anter_orders/orders/${row.id}`)}
          pagination={{
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
          }}
        />
      </PageBody>
    </Page>
  )
}
