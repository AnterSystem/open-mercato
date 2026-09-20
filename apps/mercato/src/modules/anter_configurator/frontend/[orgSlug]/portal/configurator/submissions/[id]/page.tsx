"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Button } from '@open-mercato/ui/primitives/button'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string; id: string } }

type SubmissionDetail = {
  id: string
  submissionNumber: string
  projectId: string
  revisionId: string
  projectName: string
  revisionLabel: string
  track: string
  state: string
  comments: Array<{ id: string; body: string; createdAt: string }>
}

const STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  technical_review: 'info',
  valuation: 'info',
  revision_requested: 'warning',
  rejected: 'error',
  closed_order: 'success',
  closed_offer: 'success',
}

export default function AnterConfiguratorPortalSubmissionDetailPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [item, setItem] = React.useState<SubmissionDetail | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [commentBody, setCommentBody] = React.useState('')
  const [redrawing, setRedrawing] = React.useState(false)

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  const load = React.useCallback(() => {
    if (!user) return
    setIsLoading(true)
    apiCall<{ item: SubmissionDetail }>(`/api/anter_configurator/portal/submissions/${params.id}`)
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.portal.submissions.loadError', 'Failed to load your submissions'))
          return
        }
        setItem(res.result.item)
      })
      .finally(() => setIsLoading(false))
  }, [user, params.id, t])

  React.useEffect(() => { load() }, [load])

  const handleComment = async () => {
    if (!commentBody.trim()) return
    const res = await apiCall(`/api/anter_configurator/portal/submissions/${params.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: commentBody }),
    })
    if (!res.ok) {
      flash(t('anter_configurator.portal.submissions.commentError', 'Could not add the comment'), 'error')
      return
    }
    setCommentBody('')
    load()
  }

  const handleRedraw = async () => {
    if (!item) return
    setRedrawing(true)
    try {
      const res = await apiCall<{ item: { revisionId: string } }>(`/api/anter_configurator/portal/revisions/${item.revisionId}/branch`, { method: 'POST' })
      if (!res.ok || !res.result) {
        flash(t('anter_configurator.portal.submissions.redrawError', 'Could not start a new revision'), 'error')
        return
      }
      router.push(`/${params.orgSlug}/portal/configurator/${item.projectId}`)
    } finally {
      setRedrawing(false)
    }
  }

  if (isLoading) return <LoadingMessage label={t('anter_configurator.portal.submissions.loading', 'Loading…')} />
  if (error || !item) return <ErrorMessage label={error ?? t('anter_configurator.portal.submissions.loadError', 'Failed to load your submissions')} />

  return (
    <div className="space-y-4">
      <PortalPageHeader
        title={item.submissionNumber}
        description={`${item.projectName} — ${item.revisionLabel}`}
        action={<StatusBadge variant={STATE_VARIANTS[item.state] ?? 'neutral'}>{item.state}</StatusBadge>}
      />

      {item.state === 'revision_requested' && (
        <PortalCard>
          <p className="mb-3 text-sm">{t('anter_configurator.portal.submissions.redrawExplainer', 'Changes were requested — start a new drawing based on this one.')}</p>
          <Button type="button" onClick={handleRedraw} disabled={redrawing}>
            {t('anter_configurator.portal.submissions.redraw', 'Start a new revision')}
          </Button>
        </PortalCard>
      )}

      <PortalCard>
        <h2 className="mb-3 text-sm font-semibold">{t('anter_configurator.portal.submissions.comments', 'Comments')}</h2>
        <div className="space-y-2">
          {item.comments.map((comment) => (
            <div key={comment.id} className="rounded-md border border-border p-2 text-sm">
              <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
              <p>{comment.body}</p>
            </div>
          ))}
          {item.comments.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('anter_configurator.portal.submissions.noComments', 'No comments yet.')}</p>
          )}
        </div>
        <Textarea
          className="mt-3"
          value={commentBody}
          onChange={(event) => setCommentBody(event.target.value)}
          placeholder={t('anter_configurator.portal.submissions.commentPlaceholder', 'Add a comment…')}
        />
        <Button type="button" className="mt-2" onClick={handleComment} disabled={!commentBody.trim()}>
          {t('anter_configurator.portal.submissions.commentSubmit', 'Add comment')}
        </Button>
      </PortalCard>
    </div>
  )
}
