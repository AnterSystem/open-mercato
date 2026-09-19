"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OrderRow = { id: string; order_number: string; status: string; partner_reference: string | null }
type OrderLineRow = { id: string; order_id: string; line_status: string }

type Bucket = 'released' | 'decision' | 'blocked'

type ReleaseRow = { order: OrderRow; bucket: Bucket; allocatedCount: number; totalCount: number }

const CANDIDATE_STATUSES = ['placed', 'confirmed', 'picking', 'awaiting_stock']

function bucketFor(order: OrderRow, lines: OrderLineRow[]): Bucket {
  const allocated = lines.filter((line) => line.line_status !== 'awaiting_stock').length
  if (order.status === 'picking' || (lines.length > 0 && allocated === lines.length)) return 'released'
  if (allocated > 0) return 'decision'
  return 'blocked'
}

const BUCKET_LABEL_KEYS: Record<Bucket, string> = {
  released: 'anter_orders.releases.bucket.released',
  decision: 'anter_orders.releases.bucket.decision',
  blocked: 'anter_orders.releases.bucket.blocked',
}

const BUCKET_VARIANTS: Record<Bucket, StatusBadgeVariant> = {
  released: 'success',
  decision: 'warning',
  blocked: 'neutral',
}

export default function AnterReleasesBackendPage() {
  const t = useT()
  const router = useRouter()
  const [rows, setRows] = React.useState<ReleaseRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    Promise.all(CANDIDATE_STATUSES.map((status) =>
      apiCall<{ items: OrderRow[] }>(`/api/anter_orders/orders?status=${status}&pageSize=100`).then((res) => res.ok && res.result ? res.result.items : []),
    )).then(async (groups) => {
      if (cancelled) return
      const orders = groups.flat()
      const withLines = await Promise.all(orders.map(async (order) => {
        const linesRes = await apiCall<{ items: OrderLineRow[] }>(`/api/anter_orders/order-lines?orderId=${order.id}&pageSize=100`)
        const lines = linesRes.ok && linesRes.result ? linesRes.result.items : []
        return { order, bucket: bucketFor(order, lines), allocatedCount: lines.filter((line) => line.line_status !== 'awaiting_stock').length, totalCount: lines.length }
      }))
      if (!cancelled) setRows(withLines)
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const groups = React.useMemo(() => ({
    released: rows.filter((row) => row.bucket === 'released'),
    decision: rows.filter((row) => row.bucket === 'decision'),
    blocked: rows.filter((row) => row.bucket === 'blocked'),
  }), [rows])

  const renderGroup = (bucket: Bucket, title: string) => (
    <section key={bucket} className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">{title} <span className="text-muted-foreground">({groups[bucket].length})</span></h2>
      </div>
      <div className="flex flex-col divide-y divide-border">
        {groups[bucket].map((row) => (
          <div key={row.order.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${bucket === 'blocked' ? 'opacity-60' : ''}`}>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{row.order.order_number}</p>
              {row.order.partner_reference ? <p className="text-overline text-muted-foreground">{row.order.partner_reference}</p> : null}
            </div>
            <span className="text-sm text-muted-foreground">{row.allocatedCount}/{row.totalCount} {t('anter_orders.releases.allocated', 'allocated')}</span>
            <StatusBadge variant={BUCKET_VARIANTS[bucket]}>{t(BUCKET_LABEL_KEYS[bucket], bucket)}</StatusBadge>
            {bucket !== 'blocked' ? (
              <Button size="sm" variant="secondary" onClick={() => router.push(`/backend/anter_orders/releases/${row.order.id}`)}>
                {t('anter_orders.releases.plan', 'Plan shipment')}
              </Button>
            ) : null}
          </div>
        ))}
        {!isLoading && groups[bucket].length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">{t('anter_orders.releases.empty', 'Nothing here')}</div>
        ) : null}
      </div>
    </section>
  )

  return (
    <Page>
      <PageBody>
        {renderGroup('released', t('anter_orders.releases.bucket.released', 'Ready to ship'))}
        {renderGroup('decision', t('anter_orders.releases.bucket.decision', 'Waiting for a decision'))}
        {renderGroup('blocked', t('anter_orders.releases.bucket.blocked', 'Nothing packed'))}
      </PageBody>
    </Page>
  )
}
