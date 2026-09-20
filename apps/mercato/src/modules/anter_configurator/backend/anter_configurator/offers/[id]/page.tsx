"use client"

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type OfferLine = {
  id: string
  lineNumber: number
  nameSnapshot: string
  quantity: number
  unitCode: string
  unitPriceNet: number | null
  netAmount: number | null
  isAwaitingValuation: boolean
}

type OfferDetail = {
  id: string
  offerNumber: string | null
  status: string
  isIncomplete: boolean
  incompleteReason: string | null
  currencyCode: string
  validUntil: string
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
  lines: OfferLine[]
}

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  draft: 'neutral',
  issued: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
  superseded: 'neutral',
}

export default function AnterConfiguratorOfferDetailPage() {
  const t = useT()
  const params = useParams<{ id: string }>()
  const offerId = params.id

  const [item, setItem] = React.useState<OfferDetail | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [issuing, setIssuing] = React.useState(false)

  const load = React.useCallback(() => {
    setIsLoading(true)
    apiCall<{ item: OfferDetail }>(`/api/anter_configurator/offers/${offerId}`)
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.offers.detail.loadError', 'Failed to load the offer'))
          return
        }
        setItem(res.result.item)
      })
      .finally(() => setIsLoading(false))
  }, [offerId, t])

  React.useEffect(() => { load() }, [load])

  const handleIssue = async () => {
    setIssuing(true)
    try {
      const res = await apiCall(`/api/anter_configurator/offers/${offerId}/issue`, { method: 'POST' })
      if (!res.ok) {
        flash(t('anter_configurator.offers.detail.issueError', 'Could not issue the offer'), 'error')
        return
      }
      flash(t('anter_configurator.offers.detail.issueSuccess', 'Offer issued'), 'success')
      load()
    } finally {
      setIssuing(false)
    }
  }

  if (isLoading) return <LoadingMessage label={t('anter_configurator.offers.detail.loading', 'Loading…')} />
  if (error || !item) return <ErrorMessage label={error ?? t('anter_configurator.offers.detail.loadError', 'Failed to load the offer')} />

  return (
    <Page>
      <PageBody className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{item.offerNumber ?? t('anter_configurator.offers.detail.draftLabel', 'Draft offer')}</h1>
            <p className="text-sm text-muted-foreground">{t('anter_configurator.offers.detail.validUntil', 'Valid until')} {item.validUntil}</p>
          </div>
          <div className="flex items-center gap-2">
            {item.isIncomplete && <Tag variant="warning">{t('anter_configurator.offers.incomplete', 'Incomplete')}</Tag>}
            <StatusBadge variant={STATUS_VARIANTS[item.status] ?? 'neutral'}>{item.status}</StatusBadge>
          </div>
        </div>

        {item.status === 'draft' && (
          <Button type="button" onClick={handleIssue} disabled={issuing}>
            {t('anter_configurator.offers.detail.issue', 'Issue offer')}
          </Button>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">{t('anter_configurator.offers.detail.column.line', 'Line')}</th>
              <th className="py-2">{t('anter_configurator.offers.detail.column.quantity', 'Qty')}</th>
              <th className="py-2">{t('anter_configurator.offers.detail.column.unitPrice', 'Unit price')}</th>
              <th className="py-2">{t('anter_configurator.offers.detail.column.amount', 'Amount')}</th>
            </tr>
          </thead>
          <tbody>
            {item.lines.map((line) => (
              <tr key={line.id} className="border-b border-border">
                <td className="py-2">{line.nameSnapshot}</td>
                <td className="py-2">{line.quantity} {line.unitCode}</td>
                <td className="py-2">
                  {line.isAwaitingValuation
                    ? <Tag variant="warning">{t('anter_configurator.offers.detail.awaitingValuation', 'Awaiting valuation')}</Tag>
                    : line.unitPriceNet}
                </td>
                <td className="py-2">{line.netAmount ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="text-right text-sm font-semibold">
          {t('anter_configurator.offers.detail.grandTotal', 'Grand total (net)')}: {item.grandTotalNetAmount} {item.currencyCode}
        </div>
      </PageBody>
    </Page>
  )
}
