"use client"

import * as React from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type Project = {
  id: string
  project_number: string
  name: string
  customer_entity_id: string | null
  origin: string
  status: string
  current_revision_id: string | null
}

type Revision = {
  id: string
  revision_label: string
  state: string
  metres_per_unit: string | null
  bom_computed_at: string | null
  bom_total_net_amount: string | null
  bom_currency_code: string | null
  has_unpriced_items: boolean
  technical_acceptance_state: string
}

type BomLine = {
  id: string
  sku: string | null
  nameSnapshot: string
  origin: string
  quantity: number
  unitCode: string
  realisedLengthM: number | null
  residualLengthM: number | null
  postCount: number | null
  anchorCount: number | null
  priceState: string
  netAmount: number | null
}

type BomResponse = {
  revisionId: string
  bomComputedAt: string | null
  bomTotalNetAmount: number | null
  bomCurrencyCode: string | null
  hasUnpricedItems: boolean
  lines: BomLine[]
}

const REVISION_STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  draft: 'neutral',
  submitted: 'info',
  accepted: 'success',
  stale: 'warning',
  rejected: 'error',
}

function formatMoney(value: number | null, currencyCode: string | null): string {
  if (value == null || !currencyCode) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

export default function AnterConfiguratorProjectDetailPage() {
  const t = useT()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const projectId = params?.id as string

  const [project, setProject] = React.useState<Project | null>(null)
  const [revisions, setRevisions] = React.useState<Revision[]>([])
  const [bom, setBom] = React.useState<BomResponse | null>(null)
  const [selectedRevisionId, setSelectedRevisionId] = React.useState<string | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    Promise.all([
      apiCall<{ items: Project[] }>(`/api/anter_configurator/projects?id=${projectId}`),
      apiCall<{ items: Revision[] }>(`/api/anter_configurator/revisions?projectId=${projectId}&pageSize=100`),
    ]).then(([projectRes, revisionsRes]) => {
      if (cancelled) return
      if (!projectRes.ok || !projectRes.result?.items?.[0]) {
        setError(t('anter_configurator.projects.detail.loadError', 'Failed to load the project'))
        setIsLoading(false)
        return
      }
      const loadedProject = projectRes.result.items[0]
      const loadedRevisions = revisionsRes.ok && revisionsRes.result ? revisionsRes.result.items : []
      setProject(loadedProject)
      setRevisions(loadedRevisions)
      setSelectedRevisionId(loadedProject.current_revision_id ?? loadedRevisions[0]?.id ?? null)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [projectId, t])

  React.useEffect(() => {
    if (!selectedRevisionId) {
      setBom(null)
      return
    }
    let cancelled = false
    apiCall<{ item: BomResponse }>(`/api/anter_configurator/revisions/${selectedRevisionId}/bom`)
      .then((res) => {
        if (!cancelled && res.ok && res.result) setBom(res.result.item)
      })
    return () => {
      cancelled = true
    }
  }, [selectedRevisionId])

  if (isLoading) return <LoadingMessage label={t('anter_configurator.projects.detail.loading', 'Loading…')} />
  if (error || !project) return <ErrorMessage label={error ?? t('anter_configurator.projects.detail.loadError', 'Failed to load the project')} />

  return (
    <Page>
      <PageBody>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
            <p className="text-sm text-muted-foreground">{project.project_number}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge variant={project.status === 'closed' ? 'success' : project.status === 'abandoned' ? 'warning' : 'info'}>
              {project.status}
            </StatusBadge>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/backend/anter_configurator/projects/${project.id}/draw`)}>
              {t('anter_configurator.projects.detail.draw', 'Draw (internal mode)')}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/backend/anter_configurator/projects/${project.id}/valuation`)}>
              {t('anter_configurator.projects.detail.valuation', 'Valuation')}
            </Button>
          </div>
        </div>

        <section className="mb-6">
          <h2 className="mb-2 text-sm font-medium text-foreground">
            {t('anter_configurator.projects.detail.revisionsTitle', 'Revisions')}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t('anter_configurator.projects.detail.column.revision', 'Rev.')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.projects.detail.column.state', 'State')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.projects.detail.column.technicalAcceptance', 'Technical acceptance')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.projects.detail.column.bomTotal', 'BOM total')}</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((revision) => (
                  <tr
                    key={revision.id}
                    className={`cursor-pointer border-t border-border hover:bg-muted/30 ${revision.id === selectedRevisionId ? 'bg-muted/40' : ''}`}
                    onClick={() => setSelectedRevisionId(revision.id)}
                  >
                    <td className="px-3 py-2 font-medium">{revision.revision_label}</td>
                    <td className="px-3 py-2">
                      <StatusBadge variant={REVISION_STATE_VARIANTS[revision.state] ?? 'neutral'}>{revision.state}</StatusBadge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{revision.technical_acceptance_state}</td>
                    <td className="px-3 py-2">
                      {formatMoney(revision.bom_total_net_amount != null ? Number(revision.bom_total_net_amount) : null, revision.bom_currency_code)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium text-foreground">
            {t('anter_configurator.projects.detail.bomTitle', 'Bill of materials')}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.product', 'Product')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.origin', 'Origin')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.quantity', 'Qty')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.realised', 'Realised (m)')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.residual', 'Residual (m)')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.posts', 'Posts')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.anchors', 'Anchors')}</th>
                  <th className="px-3 py-2">{t('anter_configurator.bom.column.amount', 'Net amount')}</th>
                </tr>
              </thead>
              <tbody>
                {(bom?.lines ?? []).map((line) => (
                  <tr key={line.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <span className="block font-medium text-foreground">{line.nameSnapshot}</span>
                      {line.sku ? <span className="block text-overline text-muted-foreground">{line.sku}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{line.origin}</td>
                    <td className="px-3 py-2">{line.quantity} {line.unitCode}</td>
                    <td className="px-3 py-2">{line.realisedLengthM ?? '—'}</td>
                    <td className="px-3 py-2">{line.residualLengthM ?? '—'}</td>
                    <td className="px-3 py-2">{line.postCount ?? '—'}</td>
                    <td className="px-3 py-2">{line.anchorCount ?? '—'}</td>
                    <td className="px-3 py-2">
                      {line.priceState === 'to_quote'
                        ? <StatusBadge variant="warning">to_quote</StatusBadge>
                        : formatMoney(line.netAmount, bom?.bomCurrencyCode ?? null)}
                    </td>
                  </tr>
                ))}
                {!bom?.lines?.length ? (
                  <tr>
                    <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                      {t('anter_configurator.projects.detail.bomEmpty', 'No BOM computed yet for this revision.')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </PageBody>
    </Page>
  )
}
