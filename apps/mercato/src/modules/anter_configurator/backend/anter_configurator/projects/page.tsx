"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type ProjectRow = {
  id: string
  project_number: string
  name: string
  customer_entity_id: string | null
  origin: string
  status: string
  current_revision_id: string | null
}

type ProjectListResponse = { items: ProjectRow[]; total: number; page: number; pageSize: number }

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  active: 'info',
  abandoned: 'warning',
  closed: 'success',
}

export default function AnterConfiguratorProjectsPage() {
  const t = useT()
  const router = useRouter()

  const [rows, setRows] = React.useState<ProjectRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    apiCall<ProjectListResponse>(`/api/anter_configurator/projects?${query.toString()}`)
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
  }, [page, pageSize])

  const filteredRows = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return rows
    return rows.filter((row) => row.project_number.toLowerCase().includes(term) || row.name.toLowerCase().includes(term))
  }, [rows, search])

  const columns = React.useMemo<ColumnDef<ProjectRow>[]>(() => [
    {
      accessorKey: 'project_number',
      header: t('anter_configurator.projects.column.number', 'Project'),
      meta: { maxWidth: 180 },
    },
    {
      accessorKey: 'name',
      header: t('anter_configurator.projects.column.name', 'Name'),
      meta: { truncate: true },
    },
    {
      accessorKey: 'origin',
      header: t('anter_configurator.projects.column.origin', 'Origin'),
      meta: { maxWidth: 120 },
    },
    {
      accessorKey: 'status',
      header: t('anter_configurator.projects.column.status', 'Status'),
      cell: ({ row }) => (
        <StatusBadge variant={STATUS_VARIANTS[row.original.status] ?? 'neutral'}>{row.original.status}</StatusBadge>
      ),
      meta: { maxWidth: 140 },
    },
  ], [t])

  return (
    <Page>
      <PageBody>
        <DataTable<ProjectRow>
          columns={columns}
          data={filteredRows}
          isLoading={isLoading}
          entityId="anter_configurator.project"
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t('anter_configurator.projects.searchPlaceholder', 'Search by project number or name')}
          onRowClick={(row) => router.push(`/backend/anter_configurator/projects/${row.id}`)}
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
