"use client"

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { KpiCard } from '@open-mercato/ui/backend/charts'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@open-mercato/ui/primitives/dialog'
import { useBackendChrome } from '@open-mercato/ui/backend/BackendChromeProvider'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { hasFeature } from '@open-mercato/shared/security/features'
import { useT } from '@open-mercato/shared/lib/i18n/context'

const VALUE_FEATURE = 'anter_configurator.value'

type CustomItemRow = {
  id: string
  revision_id: string
  description: string
  quantity: number
  unit_code: string | null
  valuation_state: string
  unit_price_net: number | null
  updated_at: string
}

type CustomItemListResponse = { items: CustomItemRow[]; total: number; page: number; pageSize: number }
type RevisionRow = { id: string; project_id: string; revision_label: string }
type ProjectRow = { id: string; project_number: string; name: string }

const VALUATION_STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  awaiting: 'warning',
  priced: 'success',
  declined: 'error',
}

const STATE_TABS = ['awaiting', 'priced', 'declined', 'all'] as const

function formatQuantity(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
}

/**
 * The constructor's cross-project pricing queue (spec §3.6, s10's downstream).
 *
 * A configuration containing an unpriced position cannot be ordered, so every
 * row here is blocking a partner. The list is deliberately keyed on the ITEM
 * rather than the project: the person pricing works through items, and the
 * project is context, not the unit of work.
 */
export default function AnterConfiguratorCustomItemsPage() {
  const t = useT()
  const { payload: chrome } = useBackendChrome()
  const canPrice = hasFeature(chrome?.grantedFeatures, VALUE_FEATURE)

  const [rows, setRows] = React.useState<CustomItemRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)
  const [state, setState] = React.useState<typeof STATE_TABS[number]>('awaiting')
  const [projectByRevisionId, setProjectByRevisionId] = React.useState<Record<string, ProjectRow>>({})
  const [priceDialogItem, setPriceDialogItem] = React.useState<CustomItemRow | null>(null)
  const [priceInput, setPriceInput] = React.useState('')
  const [reloadToken, setReloadToken] = React.useState(0)

  const priceMutation = useGuardedMutation<Record<string, unknown>>({
    contextId: 'anter_configurator.custom_item.price',
  })

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (state !== 'all') query.set('valuationState', state)
    apiCall<CustomItemListResponse>(`/api/anter_configurator/custom-items?${query.toString()}`)
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
  }, [page, pageSize, state, reloadToken])

  // "Across projects" is the point of this screen, but a custom item only
  // knows its revision. Two id-batched lookups beat one request per row.
  React.useEffect(() => {
    const revisionIds = [...new Set(rows.map((row) => row.revision_id))].filter(Boolean)
    if (!revisionIds.length) {
      setProjectByRevisionId({})
      return
    }
    let cancelled = false
    void (async () => {
      const revisionsRes = await apiCall<{ items: RevisionRow[] }>(
        `/api/anter_configurator/revisions?ids=${revisionIds.join(',')}&pageSize=${revisionIds.length}`,
      )
      if (cancelled || !revisionsRes.ok || !revisionsRes.result) return
      const revisions = revisionsRes.result.items
      const projectIds = [...new Set(revisions.map((revision) => revision.project_id))].filter(Boolean)
      if (!projectIds.length) return

      const projectsRes = await apiCall<{ items: ProjectRow[] }>(
        `/api/anter_configurator/projects?ids=${projectIds.join(',')}&pageSize=${projectIds.length}`,
      )
      if (cancelled || !projectsRes.ok || !projectsRes.result) return
      const projectById = new Map(projectsRes.result.items.map((project) => [project.id, project]))
      const next: Record<string, ProjectRow> = {}
      for (const revision of revisions) {
        const project = projectById.get(revision.project_id)
        if (project) next[revision.id] = project
      }
      setProjectByRevisionId(next)
    })()
    return () => {
      cancelled = true
    }
  }, [rows])

  const awaitingCount = React.useMemo(
    () => rows.filter((row) => row.valuation_state === 'awaiting').length,
    [rows],
  )

  const openPriceDialog = React.useCallback((item: CustomItemRow) => {
    setPriceDialogItem(item)
    setPriceInput(item.unit_price_net != null ? String(item.unit_price_net) : '')
  }, [])

  const handlePrice = React.useCallback(async () => {
    if (!priceDialogItem) return
    const unitPriceNet = Number(priceInput)
    if (!Number.isFinite(unitPriceNet) || unitPriceNet < 0) return

    const result = await priceMutation.runMutation({
      operation: () => apiCall<{ item: unknown }>(
        `/api/anter_configurator/custom-items/${priceDialogItem.id}/price`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ unitPriceNet }),
        },
      ),
      context: {
        moduleId: 'anter_configurator',
        entityId: 'anter_configurator.custom_item',
        operation: 'price',
        resourceKind: 'anter_configurator.custom_item',
        resourceId: priceDialogItem.id,
        formId: 'anter_configurator.custom_item.price',
        retryLastMutation: priceMutation.retryLastMutation,
      },
      mutationPayload: { unitPriceNet },
    })

    if (!result.ok || !result.result) {
      flash(t('anter_configurator.customItems.priceError', 'Could not price this item'), 'error')
      return
    }
    flash(t('anter_configurator.customItems.priceSuccess', 'Item priced'), 'success')
    setPriceDialogItem(null)
    setPriceInput('')
    setReloadToken((token) => token + 1)
  }, [priceDialogItem, priceInput, priceMutation, t])

  const columns = React.useMemo<ColumnDef<CustomItemRow>[]>(() => [
    {
      accessorKey: 'description',
      header: t('anter_configurator.customItems.column.description', 'Item'),
      meta: { truncate: true },
    },
    {
      id: 'project',
      header: t('anter_configurator.customItems.column.project', 'Project'),
      cell: ({ row }) => {
        const project = projectByRevisionId[row.original.revision_id]
        if (!project) return '—'
        return (
          <span className="block min-w-0">
            <span className="block truncate text-foreground">{project.name}</span>
            <span className="block text-overline text-muted-foreground">{project.project_number}</span>
          </span>
        )
      },
      meta: { truncate: true, maxWidth: 260 },
    },
    {
      accessorKey: 'quantity',
      header: t('anter_configurator.customItems.column.quantity', 'Quantity'),
      cell: ({ row }) => `${formatQuantity(row.original.quantity)} ${row.original.unit_code ?? ''}`.trim(),
      meta: { maxWidth: 120 },
    },
    {
      accessorKey: 'valuation_state',
      header: t('anter_configurator.customItems.column.state', 'State'),
      cell: ({ row }) => (
        <StatusBadge variant={VALUATION_STATE_VARIANTS[row.original.valuation_state] ?? 'neutral'}>
          {t(`anter_configurator.customItems.state.${row.original.valuation_state}`, row.original.valuation_state)}
        </StatusBadge>
      ),
      meta: { maxWidth: 140 },
    },
    {
      accessorKey: 'unit_price_net',
      header: t('anter_configurator.customItems.column.unitPrice', 'Unit price'),
      cell: ({ row }) => (row.original.unit_price_net != null ? String(row.original.unit_price_net) : '—'),
      meta: { maxWidth: 130 },
    },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => (
        canPrice && row.original.valuation_state === 'awaiting' ? (
          <Button size="sm" onClick={() => openPriceDialog(row.original)}>
            {t('anter_configurator.customItems.price', 'Price')}
          </Button>
        ) : null
      ),
      meta: { maxWidth: 120 },
    },
  ], [t, projectByRevisionId, canPrice, openPriceDialog])

  return (
    <Page>
      <PageBody>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
          <KpiCard title={t('anter_configurator.customItems.kpi.awaiting', 'Awaiting a price')} value={awaitingCount} />
          <KpiCard title={t('anter_configurator.customItems.kpi.total', 'Items on this page')} value={rows.length} />
        </div>

        <SegmentedControl value={state} onValueChange={(value) => { setState(value as typeof STATE_TABS[number]); setPage(1) }}>
          {STATE_TABS.map((tab) => (
            <SegmentedControlItem key={tab} value={tab}>
              {t(`anter_configurator.customItems.tab.${tab}`, tab)}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        <DataTable<CustomItemRow>
          columns={columns}
          data={rows}
          isLoading={isLoading}
          entityId="anter_configurator.custom_item"
          emptyState={t('anter_configurator.customItems.empty', 'Nothing is waiting for a price')}
          pagination={{
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
          }}
        />

        <Dialog open={priceDialogItem != null} onOpenChange={(open) => { if (!open) setPriceDialogItem(null) }}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void handlePrice()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('anter_configurator.customItems.priceTitle', 'Price this item')}</DialogTitle>
            </DialogHeader>
            {priceDialogItem ? (
              <p className="text-sm text-muted-foreground">{priceDialogItem.description}</p>
            ) : null}
            <Input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              placeholder={t('anter_configurator.customItems.pricePlaceholder', 'Net unit price')}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('anter_configurator.customItems.cancel', 'Cancel')}
                </Button>
              </DialogClose>
              <Button type="button" onClick={handlePrice} disabled={!priceInput.trim()}>
                {t('anter_configurator.customItems.confirm', 'Save price')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
