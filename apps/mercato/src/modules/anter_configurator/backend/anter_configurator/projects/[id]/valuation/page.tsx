"use client"

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type Project = { id: string; name: string; customer_entity_id: string | null }
type Revision = { id: string; bom_total_net_amount: string | null; bom_currency_code: string | null }
type BomLine = {
  nameSnapshot: string
  quantity: number
  unitCode: string
  netAmount: number | null
  unitCostNet?: number | null
  marginAtListNet?: number | null
  marginAfterDiscountNet?: number | null
}
type PartnerTerms = { id: string; accountOwnerUserId: string | null }
type UserOption = { id: string; email: string; name: string | null }

function formatMoney(value: number | null, currencyCode: string | null): string {
  if (value == null || !currencyCode) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

/**
 * The margin-less valuation view (spec s12, Implementation Plan Phase H step
 * 27): with `anter_configurator.margin.view`, cost and margin. Without it,
 * the same totals plus an explicit "Niedostępne w tej roli" list — never a
 * greyed-out empty field (s12's principle).
 */
export default function AnterConfiguratorValuationPage() {
  const t = useT()
  const params = useParams<{ id: string }>()
  const projectId = params?.id as string

  const [project, setProject] = React.useState<Project | null>(null)
  const [revision, setRevision] = React.useState<Revision | null>(null)
  const [lines, setLines] = React.useState<BomLine[]>([])
  const [owner, setOwner] = React.useState<UserOption | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setIsLoading(true)
    setError(null)

    void (async () => {
      const projectRes = await apiCall<{ items: Project[] }>(`/api/anter_configurator/projects?id=${projectId}`)
      const loadedProject = projectRes.ok ? projectRes.result?.items?.[0] : null
      if (!loadedProject) {
        if (!cancelled) {
          setError(t('anter_configurator.backend.valuation.loadError', 'Failed to load the project'))
          setIsLoading(false)
        }
        return
      }
      if (cancelled) return
      setProject(loadedProject)

      const revisionsRes = await apiCall<{ items: Revision[] }>(`/api/anter_configurator/revisions?projectId=${projectId}&pageSize=1`)
      const loadedRevision = revisionsRes.ok ? revisionsRes.result?.items?.[0] : null
      if (loadedRevision) {
        setRevision(loadedRevision)
        const bomRes = await apiCall<{ item: { lines: BomLine[] } }>(`/api/anter_configurator/revisions/${loadedRevision.id}/bom`)
        if (!cancelled && bomRes.ok && bomRes.result) setLines(bomRes.result.item.lines)
      }

      if (loadedProject.customer_entity_id) {
        const termsRes = await apiCall<{ items: PartnerTerms[] }>(`/api/anter_orders/partner-terms?customerEntityId=${loadedProject.customer_entity_id}`)
        const terms = termsRes.ok ? termsRes.result?.items?.[0] : null
        if (terms?.accountOwnerUserId) {
          const userRes = await apiCall<{ items: UserOption[] }>(`/api/auth/users?id=${terms.accountOwnerUserId}`)
          const ownerUser = userRes.ok ? userRes.result?.items?.[0] : null
          if (!cancelled && ownerUser) setOwner(ownerUser)
        }
      }

      if (!cancelled) setIsLoading(false)
    })()

    return () => {
      cancelled = true
    }
  }, [projectId, t])

  if (isLoading) return <LoadingMessage label={t('anter_configurator.backend.valuation.loading', 'Loading…')} />
  if (error || !project) return <ErrorMessage label={error ?? t('anter_configurator.backend.valuation.loadError', 'Failed to load the project')} />

  const canViewMargin = lines.some((line) => line.unitCostNet !== undefined)
  const currencyCode = revision?.bom_currency_code ?? null
  const totalCost = canViewMargin ? lines.reduce((sum, line) => sum + (line.unitCostNet ?? 0) * line.quantity, 0) : null
  const totalMargin = canViewMargin ? lines.reduce((sum, line) => sum + (line.marginAfterDiscountNet ?? line.marginAtListNet ?? 0), 0) : null

  return (
    <Page>
      <PageBody>
        <h1 className="mb-4 text-xl font-semibold text-foreground">{project.name}</h1>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4">
            <p className="text-overline text-muted-foreground">{t('anter_configurator.backend.valuation.listValue', 'List value')}</p>
            <p className="text-2xl font-semibold text-foreground">
              {formatMoney(revision?.bom_total_net_amount != null ? Number(revision.bom_total_net_amount) : null, currencyCode)}
            </p>
          </div>
          {canViewMargin ? (
            <>
              <div className="rounded-xl border border-border p-4">
                <p className="text-overline text-muted-foreground">{t('anter_configurator.backend.valuation.cost', 'Cost')}</p>
                <p className="text-2xl font-semibold text-foreground">{formatMoney(totalCost, currencyCode)}</p>
              </div>
              <div className="rounded-xl border border-border p-4">
                <p className="text-overline text-muted-foreground">{t('anter_configurator.backend.valuation.margin', 'Margin')}</p>
                <p className="text-2xl font-semibold text-foreground">{formatMoney(totalMargin, currencyCode)}</p>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-border p-4 sm:col-span-2">
              <p className="text-overline text-muted-foreground">{t('anter_configurator.backend.valuation.restrictedTitle', 'Niedostępne w tej roli')}</p>
              <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                <li>{t('anter_configurator.backend.valuation.restrictedCost', 'Cost')}</li>
                <li>{t('anter_configurator.backend.valuation.restrictedMargin', 'Margin')}</li>
              </ul>
              {owner ? (
                <Button asChild type="button" variant="outline" size="sm" className="mt-3">
                  <a href={`mailto:${owner.email}?subject=${encodeURIComponent(project.name)}`}>
                    {t('anter_configurator.backend.valuation.handoff', 'Przekaż opiekunowi')}
                  </a>
                </Button>
              ) : null}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('anter_configurator.bom.column.product', 'Product')}</th>
                <th className="px-3 py-2">{t('anter_configurator.bom.column.quantity', 'Qty')}</th>
                <th className="px-3 py-2">{t('anter_configurator.bom.column.amount', 'Net amount')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="px-3 py-2">{line.nameSnapshot}</td>
                  <td className="px-3 py-2">{line.quantity} {line.unitCode}</td>
                  <td className="px-3 py-2">{formatMoney(line.netAmount, currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageBody>
    </Page>
  )
}
