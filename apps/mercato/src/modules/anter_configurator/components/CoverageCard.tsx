"use client"

import * as React from 'react'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'

export type PlanPointView = {
  id: string
  pointKind: string
  state: 'open' | 'covered' | 'skipped'
  skipReason: string | null
}

export type CoverageCardProps = {
  points: PlanPointView[]
}

const STATE_VARIANTS: Record<string, StatusBadgeVariant> = {
  covered: 'success',
  open: 'warning',
  skipped: 'neutral',
}

/**
 * The coverage card (spec §3.15, s13's "Punkty do zabezpieczenia"). Points
 * are declared elsewhere (imported/placed by whoever prepares the project);
 * this card only reports the computed coverage per kind — it never forces
 * completeness, matching the prototype's own stated principle.
 */
export function CoverageCard({ points }: CoverageCardProps) {
  const t = useT()

  const byKind = React.useMemo(() => {
    const groups = new Map<string, PlanPointView[]>()
    for (const point of points) {
      const list = groups.get(point.pointKind) ?? []
      list.push(point)
      groups.set(point.pointKind, list)
    }
    return [...groups.entries()]
  }, [points])

  if (!points.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('anter_configurator.coverage.empty', 'No points declared for this project.')}
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {byKind.map(([kind, kindPoints]) => {
        const coveredCount = kindPoints.filter((point) => point.state === 'covered').length
        return (
          <div key={kind} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <span className="text-sm font-medium text-foreground">{t(`anter_configurator.coverage.kind.${kind}`, kind)}</span>
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              {coveredCount}/{kindPoints.length}
              <StatusBadge variant={coveredCount === kindPoints.length ? 'success' : 'warning'} dot>
                {coveredCount === kindPoints.length
                  ? t('anter_configurator.coverage.complete', 'Complete')
                  : t('anter_configurator.coverage.pending', 'Pending')}
              </StatusBadge>
            </span>
          </div>
        )
      })}
      <ul className="space-y-1">
        {points.filter((point) => point.state !== 'covered').map((point) => (
          <li key={point.id} className="flex items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge variant={STATE_VARIANTS[point.state] ?? 'neutral'}>{point.state}</StatusBadge>
            {t(`anter_configurator.coverage.kind.${point.pointKind}`, point.pointKind)}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default CoverageCard
