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

type SubmissionRow = {
  id: string
  submissionNumber: string
  projectName: string
  revisionLabel: string
  track: string
  state: string
  submittedAt: string
}

const STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  technical_review: 'info',
  valuation: 'info',
  revision_requested: 'warning',
  rejected: 'error',
  closed_order: 'success',
  closed_offer: 'success',
}

export default function AnterConfiguratorPortalSubmissionsPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [rows, setRows] = React.useState<SubmissionRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    setIsLoading(true)
    apiCall<{ items: SubmissionRow[] }>('/api/anter_configurator/portal/submissions')
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.portal.submissions.loadError', 'Failed to load your submissions'))
          return
        }
        setRows(res.result.items)
      })
      .finally(() => setIsLoading(false))
  }, [user, t])

  if (isLoading) return <LoadingMessage label={t('anter_configurator.portal.submissions.loading', 'Loading…')} />
  if (error) return <ErrorMessage label={error} />

  return (
    <div className="space-y-4">
      <PortalPageHeader title={t('anter_configurator.portal.submissions.title', 'My submissions')} />
      {rows.length === 0 ? (
        <PortalEmptyState
          title={t('anter_configurator.portal.submissions.emptyTitle', 'No submissions yet')}
          description={t('anter_configurator.portal.submissions.emptyDescription', 'Send a configuration for review to see it here.')}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.id}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/${params.orgSlug}/portal/configurator/submissions/${row.id}`)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') router.push(`/${params.orgSlug}/portal/configurator/submissions/${row.id}`)
              }}
            >
              <PortalCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{row.submissionNumber}</p>
                    <p className="text-sm text-muted-foreground">{row.projectName} — {row.revisionLabel}</p>
                  </div>
                  <StatusBadge variant={STATE_VARIANTS[row.state] ?? 'neutral'}>{row.state}</StatusBadge>
                </div>
              </PortalCard>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
