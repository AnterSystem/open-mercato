"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OrderLineRow = {
  id: string
  order_id: string
  line_number: number
  sku: string | null
  name_snapshot: string
  quantity: number
  fulfilment_mode: string
  line_status: string
}

type OrderLineListResponse = { items: OrderLineRow[]; total: number }

const LINE_STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  awaiting_stock: 'info',
  allocated: 'neutral',
  packed: 'info',
  shipped: 'info',
  delivered: 'success',
}

type Tab = 'all' | 'production' | 'stock' | 'awaiting_order'

export default function AnterFulfilmentBackendPage() {
  const t = useT()
  const router = useRouter()
  const [tab, setTab] = React.useState<Tab>('all')
  const [rows, setRows] = React.useState<OrderLineRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)

  const allocateMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.fulfilment.allocate' })

  const load = React.useCallback(async () => {
    setIsLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (tab === 'production') query.set('fulfilmentMode', 'production')
    else if (tab === 'stock') query.set('fulfilmentMode', 'stock')
    else if (tab === 'awaiting_order') query.set('lineStatus', 'awaiting_stock')
    const res = await apiCall<OrderLineListResponse>(`/api/anter_orders/order-lines?${query.toString()}`)
    if (res.ok && res.result) {
      setRows(res.result.items)
      setTotal(res.result.total)
    }
    setIsLoading(false)
  }, [tab, page, pageSize])

  React.useEffect(() => { void load() }, [load])

  const handleAllocate = React.useCallback(async (line: OrderLineRow) => {
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
        resourceId: line.order_id,
        formId: 'anter_orders.fulfilment.allocate',
        retryLastMutation: allocateMutation.retryLastMutation,
      },
      mutationPayload: { orderLineId: line.id },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_orders.fulfilment.allocateError', 'Could not allocate this line'), 'error')
      return
    }
    flash(t('anter_orders.fulfilment.allocateSuccess', 'Allocated'), 'success')
    void load()
  }, [allocateMutation, t, load])

  const columns = React.useMemo<ColumnDef<OrderLineRow>[]>(() => [
    {
      id: 'line',
      header: t('anter_orders.fulfilment.column.line', 'Line'),
      cell: ({ row }) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-foreground">{row.original.name_snapshot}</span>
          {row.original.sku ? <span className="block text-overline text-muted-foreground">{row.original.sku}</span> : null}
        </span>
      ),
      meta: { truncate: true, maxWidth: 320 },
    },
    {
      id: 'order',
      header: t('anter_orders.fulfilment.column.order', 'Order'),
      cell: ({ row }) => (
        <button type="button" className="text-accent-indigo hover:underline" onClick={() => router.push(`/backend/anter_orders/orders/${row.original.order_id}`)}>
          {row.original.order_id.slice(0, 8)}
        </button>
      ),
      meta: { maxWidth: 140 },
    },
    {
      accessorKey: 'fulfilment_mode',
      header: t('anter_orders.fulfilment.column.fulfilmentMode', 'Fulfilment mode'),
      meta: { maxWidth: 160 },
    },
    {
      id: 'quantity',
      header: t('anter_orders.fulfilment.column.quantity', 'Quantity'),
      cell: ({ row }) => row.original.quantity,
      meta: { maxWidth: 100 },
    },
    {
      accessorKey: 'line_status',
      header: t('anter_orders.fulfilment.column.status', 'Status'),
      cell: ({ row }) => (
        <StatusBadge variant={LINE_STATUS_VARIANTS[row.original.line_status] ?? 'neutral'}>
          {t(`anter_portal.lineStatus.${row.original.line_status}`, row.original.line_status)}
        </StatusBadge>
      ),
      meta: { maxWidth: 160 },
    },
    {
      id: 'action',
      header: '',
      meta: { maxWidth: 120 },
      cell: ({ row }) => row.original.line_status === 'awaiting_stock' ? (
        <Button size="sm" variant="secondary" onClick={() => handleAllocate(row.original)}>
          {t('anter_orders.fulfilment.allocate', 'Allocate')}
        </Button>
      ) : null,
    },
  ], [t, router, handleAllocate])

  return (
    <Page>
      <PageBody>
        <Tabs value={tab} onValueChange={(value) => { setTab(value as Tab); setPage(1) }} variant="underline">
          <TabsList aria-label={t('anter_orders.fulfilment.title', 'Fulfilment')}>
            <TabsTrigger value="all">{t('anter_orders.fulfilment.tabs.all', 'All')}</TabsTrigger>
            <TabsTrigger value="production">{t('anter_orders.fulfilment.tabs.production', 'Production only')}</TabsTrigger>
            <TabsTrigger value="stock">{t('anter_orders.fulfilment.tabs.stock', 'Stock only')}</TabsTrigger>
            <TabsTrigger value="awaiting_order">{t('anter_orders.fulfilment.tabs.awaitingOrder', 'Awaiting order')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mt-4">
          <DataTable<OrderLineRow>
            columns={columns}
            data={rows}
            isLoading={isLoading}
            entityId="anter_orders.order_line"
            pagination={{
              page,
              pageSize,
              total,
              totalPages: Math.max(1, Math.ceil(total / pageSize)),
              onPageChange: setPage,
              onPageSizeChange: () => {},
            }}
          />
        </div>
      </PageBody>
    </Page>
  )
}
