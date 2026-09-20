"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string } }

type OfferRow = {
  id: string
  offerNumber: string | null
  projectName: string
  revisionLabel: string
  status: string
  grandTotalGrossAmount: number
  currencyCode: string
  validUntil: string
}

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  issued: 'info',
  accepted: 'success',
  rejected: 'error',
  expired: 'warning',
  superseded: 'neutral',
}

export default function AnterConfiguratorPortalOffersPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [rows, setRows] = React.useState<OfferRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    setIsLoading(true)
    apiCall<{ items: OfferRow[] }>('/api/anter_configurator/portal/offers')
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.portal.offers.loadError', 'Failed to load your offers'))
          return
        }
        setRows(res.result.items)
      })
      .finally(() => setIsLoading(false))
  }, [user, t])

  if (isLoading) return <LoadingMessage label={t('anter_configurator.portal.offers.loading', 'Loading…')} />
  if (error) return <ErrorMessage label={error} />

  return (
    <div className="space-y-4">
      <PortalPageHeader title={t('anter_configurator.portal.offers.title', 'My offers')} />
      {rows.length === 0 ? (
        <PortalEmptyState
          title={t('anter_configurator.portal.offers.emptyTitle', 'No offers yet')}
          description={t('anter_configurator.portal.offers.emptyDescription', 'Offers appear here once staff issues one for your configuration.')}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/${params.orgSlug}/portal/configurator/offers/${row.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') router.push(`/${params.orgSlug}/portal/configurator/offers/${row.id}`)
              }}
            >
              <PortalCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{row.offerNumber}</p>
                    <p className="text-sm text-muted-foreground">{row.projectName} — {row.revisionLabel}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{row.grandTotalGrossAmount} {row.currencyCode}</span>
                    <StatusBadge variant={STATUS_VARIANTS[row.status] ?? 'neutral'}>{row.status}</StatusBadge>
                  </div>
                </div>
              </PortalCard>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
