"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@open-mercato/ui/primitives/select'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string; id: string } }

type OfferLine = {
  id: string
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
  projectName: string
  revisionLabel: string
  status: string
  currencyCode: string
  validUntil: string
  grandTotalNetAmount: number
  grandTotalGrossAmount: number
  lines: OfferLine[]
}

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  issued: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
  superseded: 'neutral',
}

export default function AnterConfiguratorPortalOfferDetailPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [item, setItem] = React.useState<OfferDetail | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [deliveryMode, setDeliveryMode] = React.useState<'partner_warehouse' | 'end_customer' | 'self_collection'>('self_collection')
  const [accepting, setAccepting] = React.useState(false)

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    setIsLoading(true)
    apiCall<{ item: OfferDetail }>(`/api/anter_configurator/portal/offers/${params.id}`)
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.portal.offers.loadError', 'Failed to load your offers'))
          return
        }
        setItem(res.result.item)
      })
      .finally(() => setIsLoading(false))
  }, [user, params.id, t])

  const handleAccept = async () => {
    setAccepting(true)
    try {
      const res = await apiCall<{ item: { orderId: string; orderNumber: string } }>(`/api/anter_configurator/portal/offers/${params.id}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryMode }),
      })
      if (!res.ok || !res.result) {
        flash(t('anter_configurator.portal.offers.acceptError', 'Could not accept the offer'), 'error')
        return
      }
      flash(t('anter_configurator.portal.offers.acceptSuccess', 'Offer accepted — order placed'), 'success')
      router.push(`/${params.orgSlug}/portal/orders/${res.result.item.orderId}`)
    } finally {
      setAccepting(false)
    }
  }

  if (isLoading) return <LoadingMessage label={t('anter_configurator.portal.offers.loading', 'Loading…')} />
  if (error || !item) return <ErrorMessage label={error ?? t('anter_configurator.portal.offers.loadError', 'Failed to load your offers')} />

  return (
    <div className="space-y-4">
      <PortalPageHeader
        title={item.offerNumber ?? ''}
        description={`${item.projectName} — ${item.revisionLabel}`}
        action={<StatusBadge variant={STATUS_VARIANTS[item.status] ?? 'neutral'}>{item.status}</StatusBadge>}
      />

      <PortalCard>
        <div className="space-y-2">
          {item.lines.map((line) => (
            <div key={line.id} className="flex items-center justify-between border-b border-border py-2 text-sm">
              <span>{line.nameSnapshot} × {line.quantity} {line.unitCode}</span>
              <span>{line.isAwaitingValuation ? t('anter_configurator.portal.offers.awaitingValuation', 'Awaiting valuation') : line.netAmount}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-right text-sm font-semibold">
          {t('anter_configurator.portal.offers.grandTotal', 'Grand total')}: {item.grandTotalGrossAmount} {item.currencyCode}
        </div>
      </PortalCard>

      {item.status === 'issued' && (
        <PortalCard>
          <label className="mb-2 block text-sm font-medium">{t('anter_configurator.portal.offers.deliveryMode', 'Delivery mode')}</label>
          <Select value={deliveryMode} onValueChange={(value) => setDeliveryMode(value as typeof deliveryMode)}>
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="self_collection">{t('anter_configurator.portal.offers.deliverySelfCollection', 'Self collection')}</SelectItem>
              <SelectItem value="partner_warehouse">{t('anter_configurator.portal.offers.deliveryPartnerWarehouse', 'Partner warehouse')}</SelectItem>
              <SelectItem value="end_customer">{t('anter_configurator.portal.offers.deliveryEndCustomer', 'End customer')}</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" className="mt-3" onClick={handleAccept} disabled={accepting}>
            {t('anter_configurator.portal.offers.accept', 'Accept and place order')}
          </Button>
        </PortalCard>
      )}
    </div>
  )
}
