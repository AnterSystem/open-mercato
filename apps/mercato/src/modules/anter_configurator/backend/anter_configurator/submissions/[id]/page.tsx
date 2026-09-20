"use client"

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { Button } from '@open-mercato/ui/primitives/button'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Switch } from '@open-mercato/ui/primitives/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PlanCanvas } from '../../../../components/PlanCanvas'
import type { ElementDraft } from '../../../../components/types'

type SubmissionDetail = {
  id: string
  submissionNumber: string
  projectId: string
  projectName: string
  revisionLabel: string
  track: string
  state: string
  dueAt: string | null
  submittedAt: string
  closedAt: string | null
  drawing: {
    metresPerUnit: number | null
    underlayWidthUnits: number | null
    underlayHeightUnits: number | null
    elements: Array<{ id: string; elementKind: string; productId: string | null; geometry: unknown; hostElementId: string | null; label: string | null; isOutsidePriceList: boolean }>
  }
  comments: Array<{ id: string; body: string; visibility: string; authorUserId: string | null; authorCustomerUserId: string | null; createdAt: string }>
  events: Array<{ id: string; fromState: string | null; toState: string; reason: string | null; occurredAt: string }>
}

const STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  technical_review: 'info',
  valuation: 'info',
  revision_requested: 'warning',
  rejected: 'error',
  closed_order: 'success',
  closed_offer: 'success',
}

export default function AnterConfiguratorSubmissionDetailPage() {
  const t = useT()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const submissionId = params.id

  const [item, setItem] = React.useState<SubmissionDetail | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [commentBody, setCommentBody] = React.useState('')
  const [commentInternal, setCommentInternal] = React.useState(false)
  const [reasonDialog, setReasonDialog] = React.useState<'request-changes' | 'reject' | null>(null)
  const [reason, setReason] = React.useState('')

  const { runMutation } = useGuardedMutation({ contextId: `anter_configurator.submission.${submissionId}` })

  const load = React.useCallback(() => {
    setIsLoading(true)
    apiCall<{ item: SubmissionDetail }>(`/api/anter_configurator/submissions/${submissionId}`)
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.submissions.detail.loadError', 'Failed to load the submission'))
          return
        }
        setItem(res.result.item)
      })
      .finally(() => setIsLoading(false))
  }, [submissionId, t])

  React.useEffect(() => { load() }, [load])

  const handleDecision = async (path: 'accept-technical' | 'request-changes' | 'reject', body?: Record<string, unknown>) => {
    try {
      await runMutation({
        operation: () => apiCall(`/api/anter_configurator/submissions/${submissionId}/${path}`, {
          method: 'POST',
          headers: body ? { 'Content-Type': 'application/json' } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }),
        context: { entityId: 'anter_configurator.submission', operation: 'update' },
      })
      flash(t('anter_configurator.submissions.detail.decisionSuccess', 'Decision recorded'), 'success')
      setReasonDialog(null)
      setReason('')
      load()
    } catch {
      flash(t('anter_configurator.submissions.detail.decisionError', 'Could not record the decision'), 'error')
    }
  }

  const handleAddComment = async () => {
    if (!commentBody.trim()) return
    try {
      await runMutation({
        operation: () => apiCall(`/api/anter_configurator/submissions/${submissionId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: commentBody, visibility: commentInternal ? 'internal' : 'shared' }),
        }),
        context: { entityId: 'anter_configurator.submission_comment', operation: 'create' },
      })
      setCommentBody('')
      load()
    } catch {
      flash(t('anter_configurator.submissions.detail.commentError', 'Could not add the comment'), 'error')
    }
  }

  if (isLoading) return <LoadingMessage label={t('anter_configurator.submissions.detail.loading', 'Loading…')} />
  if (error || !item) return <ErrorMessage label={error ?? t('anter_configurator.submissions.detail.loadError', 'Failed to load the submission')} />

  const elements: ElementDraft[] = item.drawing.elements.map((element) => ({
    id: element.id,
    elementKind: element.elementKind as ElementDraft['elementKind'],
    productId: element.productId,
    productVariantId: null,
    geometry: element.geometry as ElementDraft['geometry'],
    hostElementId: element.hostElementId,
    label: element.label,
    sortOrder: 0,
    isOutsidePriceList: element.isOutsidePriceList,
  }))

  const canDecide = item.state === 'technical_review'

  return (
    <Page>
      <PageBody className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{item.submissionNumber}</h1>
            <p className="text-sm text-muted-foreground">{item.projectName} — {item.revisionLabel}</p>
          </div>
          <div className="flex items-center gap-2">
            <Tag variant={item.track === 'priced' ? 'success' : 'info'}>
              {item.track === 'priced' ? t('anter_configurator.submissions.track.priced', 'Priced') : t('anter_configurator.submissions.track.unpriced', 'No-price')}
            </Tag>
            <StatusBadge variant={STATE_VARIANTS[item.state] ?? 'neutral'}>{item.state}</StatusBadge>
          </div>
        </div>

        {canDecide && (
          <div className="flex gap-2">
            <Button type="button" onClick={() => handleDecision('accept-technical')}>
              {t('anter_configurator.submissions.detail.accept', 'Accept technically')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setReasonDialog('request-changes')}>
              {t('anter_configurator.submissions.detail.requestChanges', 'Request changes')}
            </Button>
            <Button type="button" variant="destructive" onClick={() => setReasonDialog('reject')}>
              {t('anter_configurator.submissions.detail.reject', 'Reject')}
            </Button>
          </div>
        )}

        <div className="rounded-md border border-border" style={{ height: 480 }}>
          <PlanCanvas
            elements={elements}
            onElementsChange={() => {}}
            underlayWidthUnits={item.drawing.underlayWidthUnits}
            underlayHeightUnits={item.drawing.underlayHeightUnits}
            gridSizeM={0.5}
            metresPerUnit={item.drawing.metresPerUnit}
            activeProductId={null}
            selectedElementId={null}
            onSelectedElementChange={() => {}}
            readOnly
          />
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t('anter_configurator.submissions.detail.comments', 'Comments')}</h2>
          <div className="space-y-2">
            {item.comments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center gap-2">
                  {comment.visibility === 'internal' && (
                    <Tag variant="warning">{t('anter_configurator.submissions.detail.internalTag', 'Internal')}</Tag>
                  )}
                  <span className="text-xs text-muted-foreground">{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
                <p>{comment.body}</p>
              </div>
            ))}
            {item.comments.length === 0 && (
              <p className="text-sm text-muted-foreground">{t('anter_configurator.submissions.detail.noComments', 'No comments yet.')}</p>
            )}
          </div>
          <Textarea value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder={t('anter_configurator.submissions.detail.commentPlaceholder', 'Add a comment…')} />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={commentInternal} onCheckedChange={setCommentInternal} />
              {t('anter_configurator.submissions.detail.internalToggle', 'Internal note (staff only)')}
            </label>
            <Button type="button" onClick={handleAddComment} disabled={!commentBody.trim()}>
              {t('anter_configurator.submissions.detail.commentSubmit', 'Add comment')}
            </Button>
          </div>
        </div>

        <Dialog open={reasonDialog != null} onOpenChange={(open) => { if (!open) setReasonDialog(null) }}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleDecision(reasonDialog!, { reason })
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {reasonDialog === 'reject'
                  ? t('anter_configurator.submissions.detail.rejectTitle', 'Reject submission')
                  : t('anter_configurator.submissions.detail.requestChangesTitle', 'Request changes')}
              </DialogTitle>
            </DialogHeader>
            <Textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t('anter_configurator.submissions.detail.reasonPlaceholder', 'Explain why…')}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">{t('anter_configurator.submissions.detail.cancel', 'Cancel')}</Button>
              </DialogClose>
              <Button type="button" onClick={() => handleDecision(reasonDialog!, { reason })} disabled={!reason.trim()}>
                {t('anter_configurator.submissions.detail.confirm', 'Confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Button type="button" variant="ghost" onClick={() => router.push('/backend/anter_configurator/submissions')}>
          {t('anter_configurator.submissions.detail.back', 'Back to queue')}
        </Button>
      </PageBody>
    </Page>
  )
}
