"use client"

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type ShipmentRow = {
  id: string
  order_id: string
  shipment_number: string
  status: string
  carrier_name: string | null
  tracking_number: string | null
  updatedAt: string
}

type ShipmentListResponse = { items: ShipmentRow[]; total: number }

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  planned: 'neutral',
  dispatched: 'info',
  delivered: 'success',
}

export default function AnterShipmentsBackendPage() {
  const t = useT()
  const [rows, setRows] = React.useState<ShipmentRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(50)
  const [isLoading, setIsLoading] = React.useState(true)
  const [dispatchTarget, setDispatchTarget] = React.useState<ShipmentRow | null>(null)
  const [carrierName, setCarrierName] = React.useState('')
  const [trackingNumber, setTrackingNumber] = React.useState('')

  const dispatchMutation = useGuardedMutation<Record<string, unknown>>({ contextId: 'anter_orders.shipment.dispatch' })

  const load = React.useCallback(async () => {
    setIsLoading(true)
    const res = await apiCall<ShipmentListResponse>(`/api/anter_orders/shipments?page=${page}&pageSize=${pageSize}`)
    if (res.ok && res.result) {
      setRows(res.result.items)
      setTotal(res.result.total)
    }
    setIsLoading(false)
  }, [page, pageSize])

  React.useEffect(() => { void load() }, [load])

  const handleDispatch = React.useCallback(async () => {
    if (!dispatchTarget) return
    const result = await dispatchMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(dispatchTarget.updatedAt),
        () => apiCall<{ item: unknown }>(`/api/anter_orders/shipments/${dispatchTarget.id}/dispatch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ carrierName, trackingNumber }),
        }),
      ),
      context: {
        moduleId: 'anter_orders',
        entityId: 'anter_orders.shipment',
        operation: 'dispatch',
        resourceKind: 'anter_orders.shipment',
        resourceId: dispatchTarget.id,
        formId: 'anter_orders.shipment.dispatch',
        retryLastMutation: dispatchMutation.retryLastMutation,
      },
      mutationPayload: { shipmentId: dispatchTarget.id },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_orders.shipments.dispatchError', 'Could not dispatch this shipment'), 'error')
      return
    }
    flash(t('anter_orders.shipments.dispatchSuccess', 'Shipment dispatched'), 'success')
    setDispatchTarget(null)
    setCarrierName('')
    setTrackingNumber('')
    void load()
  }, [dispatchTarget, carrierName, trackingNumber, dispatchMutation, t, load])

  const columns = React.useMemo<ColumnDef<ShipmentRow>[]>(() => [
    { accessorKey: 'shipment_number', header: t('anter_orders.shipments.column.number', 'Shipment') },
    {
      accessorKey: 'status',
      header: t('anter_orders.shipments.column.status', 'Status'),
      cell: ({ row }) => <StatusBadge variant={STATUS_VARIANTS[row.original.status] ?? 'neutral'}>{row.original.status}</StatusBadge>,
    },
    { accessorKey: 'carrier_name', header: t('anter_orders.shipments.column.carrier', 'Carrier'), cell: ({ row }) => row.original.carrier_name ?? '—' },
    { accessorKey: 'tracking_number', header: t('anter_orders.shipments.column.tracking', 'Tracking'), cell: ({ row }) => row.original.tracking_number ?? '—' },
    {
      id: 'action',
      header: '',
      cell: ({ row }) => row.original.status === 'planned' ? (
        <Button size="sm" variant="secondary" onClick={() => setDispatchTarget(row.original)}>
          {t('anter_orders.shipments.dispatch', 'Dispatch')}
        </Button>
      ) : null,
    },
  ], [t])

  return (
    <Page>
      <PageBody>
        <DataTable<ShipmentRow>
          columns={columns}
          data={rows}
          isLoading={isLoading}
          entityId="anter_orders.shipment"
          pagination={{
            page,
            pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / pageSize)),
            onPageChange: setPage,
            onPageSizeChange: () => {},
          }}
        />

        <Dialog open={dispatchTarget != null} onOpenChange={(open) => { if (!open) setDispatchTarget(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('anter_orders.shipments.dispatch', 'Dispatch')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <FormField label={t('anter_orders.shipments.column.carrier', 'Carrier')}>
                <Input value={carrierName} onChange={(event) => setCarrierName(event.target.value)} />
              </FormField>
              <FormField label={t('anter_orders.shipments.column.tracking', 'Tracking')}>
                <Input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} />
              </FormField>
              <Button onClick={handleDispatch} disabled={!carrierName.trim() || !trackingNumber.trim()}>
                {t('anter_orders.shipments.dispatch', 'Dispatch')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}
