"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OfferRow = {
  id: string
  offer_number: string | null
  status: string
  is_incomplete: boolean
  currency_code: string
  grand_total_net_amount: string
  valid_until: string
}

type OfferListResponse = { items: OfferRow[]; total: number; page: number; pageSize: number }

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  draft: 'neutral',
  issued: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
  superseded: 'neutral',
}

export default function AnterConfiguratorOffersPage() {
  const t = useT()
  const router = useRouter()

  const [rows, setRows] = React.useState<OfferRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    apiCall<OfferListResponse>(`/api/anter_configurator/offers?${query.toString()}`)
      .then((res) => {
        if (cancelled || !res.ok || !res.result) return
        setRows(res.result.items)
        setTotal(res.result.total)
      })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [page, pageSize])

  const columns = React.useMemo<ColumnDef<OfferRow>[]>(() => [
    { accessorKey: 'offer_number', header: t('anter_configurator.offers.column.number', 'Offer'), meta: { maxWidth: 160 } },
    {
      accessorKey: 'status',
      header: t('anter_configurator.offers.column.status', 'Status'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <StatusBadge variant={STATUS_VARIANTS[row.original.status] ?? 'neutral'}>{row.original.status}</StatusBadge>
          {row.original.is_incomplete && <Tag variant="warning">{t('anter_configurator.offers.incomplete', 'Incomplete')}</Tag>}
        </div>
      ),
      meta: { maxWidth: 220 },
    },
    { accessorKey: 'grand_total_net_amount', header: t('anter_configurator.offers.column.total', 'Total net'), meta: { maxWidth: 140 } },
    { accessorKey: 'valid_until', header: t('anter_configurator.offers.column.validUntil', 'Valid until'), meta: { maxWidth: 140 } },
  ], [t])

  return (
    <Page>
      <PageBody>
        <DataTable<OfferRow>
          columns={columns}
          data={rows}
          isLoading={isLoading}
          entityId="anter_configurator.offer"
          onRowClick={(row) => router.push(`/backend/anter_configurator/offers/${row.id}`)}
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
