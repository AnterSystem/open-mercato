"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { KpiCard } from '@open-mercato/ui/backend/charts'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type SubmissionRow = {
  id: string
  submissionNumber: string
  projectName: string
  revisionLabel: string
  track: string
  state: string
  dueAt: string | null
  submittedAt: string
  positionCount: number
  isOverdue: boolean
}

type SubmissionListResponse = { items: SubmissionRow[]; total: number; page: number; pageSize: number; kpi: Record<string, number> }

const STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  technical_review: 'info',
  valuation: 'info',
  revision_requested: 'warning',
  rejected: 'error',
  closed_order: 'success',
  closed_offer: 'success',
}

const STATE_TABS = ['all', 'technical_review', 'valuation', 'revision_requested', 'rejected', 'closed_order'] as const

export default function AnterConfiguratorSubmissionsPage() {
  const t = useT()
  const router = useRouter()

  const [rows, setRows] = React.useState<SubmissionRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [kpi, setKpi] = React.useState<Record<string, number>>({})
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)
  const [state, setState] = React.useState<typeof STATE_TABS[number]>('all')

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (state !== 'all') query.set('state', state)
    apiCall<SubmissionListResponse>(`/api/anter_configurator/submissions?${query.toString()}`)
      .then((res) => {
        if (cancelled || !res.ok || !res.result) return
        setRows(res.result.items)
        setTotal(res.result.total)
        setKpi(res.result.kpi)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [page, pageSize, state])

  const overdueCount = React.useMemo(() => rows.filter((row) => row.isOverdue).length, [rows])

  const columns = React.useMemo<ColumnDef<SubmissionRow>[]>(() => [
    { accessorKey: 'submissionNumber', header: t('anter_configurator.submissions.column.number', 'Submission'), meta: { maxWidth: 160 } },
    { accessorKey: 'projectName', header: t('anter_configurator.submissions.column.project', 'Project'), meta: { truncate: true } },
    {
      accessorKey: 'track',
      header: t('anter_configurator.submissions.column.track', 'Track'),
      cell: ({ row }) => (
        <Tag variant={row.original.track === 'priced' ? 'success' : 'info'}>
          {row.original.track === 'priced'
            ? t('anter_configurator.submissions.track.priced', 'Priced')
            : t('anter_configurator.submissions.track.unpriced', 'No-price')}
        </Tag>
      ),
      meta: { maxWidth: 130 },
    },
    {
      accessorKey: 'state',
      header: t('anter_configurator.submissions.column.state', 'State'),
      cell: ({ row }) => <StatusBadge variant={STATE_VARIANTS[row.original.state] ?? 'neutral'}>{row.original.state}</StatusBadge>,
      meta: { maxWidth: 160 },
    },
    {
      accessorKey: 'dueAt',
      header: t('anter_configurator.submissions.column.due', 'Due'),
      cell: ({ row }) => (
        <span className={row.original.isOverdue ? 'text-status-error-fg' : undefined}>
          {row.original.dueAt ? new Date(row.original.dueAt).toLocaleDateString() : '—'}
        </span>
      ),
      meta: { maxWidth: 120 },
    },
    { accessorKey: 'positionCount', header: t('anter_configurator.submissions.column.positions', 'Positions'), meta: { maxWidth: 100 } },
  ], [t])

  return (
    <Page>
      <PageBody>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KpiCard title={t('anter_configurator.submissions.kpi.technicalReview', 'In technical review')} value={kpi.technical_review ?? 0} />
          <KpiCard title={t('anter_configurator.submissions.kpi.overdue', 'Overdue')} value={overdueCount} />
          <KpiCard title={t('anter_configurator.submissions.kpi.valuation', 'In valuation')} value={kpi.valuation ?? 0} />
          <KpiCard title={t('anter_configurator.submissions.kpi.revisionRequested', 'Revision requested')} value={kpi.revision_requested ?? 0} />
        </div>

        <SegmentedControl value={state} onValueChange={(value) => { setState(value as typeof STATE_TABS[number]); setPage(1) }}>
          {STATE_TABS.map((tab) => (
            <SegmentedControlItem key={tab} value={tab}>
              {t(`anter_configurator.submissions.tab.${tab}`, tab)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <DataTable<SubmissionRow>
          columns={columns}
          data={rows}
          isLoading={isLoading}
          entityId="anter_configurator.submission"
          onRowClick={(row) => router.push(`/backend/anter_configurator/submissions/${row.id}`)}
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
