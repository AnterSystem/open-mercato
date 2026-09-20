"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Ruler, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'
import { PortalCard } from '@open-mercato/ui/portal/components/PortalCard'

type Props = { params: { orgSlug: string } }

type ProjectRow = {
  id: string
  projectNumber: string
  name: string
  status: string
  currentRevisionId: string | null
}

type ProjectListResponse = { items: ProjectRow[]; total: number }

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  active: 'info',
  abandoned: 'warning',
  closed: 'success',
}

/** Portal project list (spec s13/s14 left rail, Implementation Plan Phase G step 18). */
export default function AnterConfiguratorPortalProjectsPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [rows, setRows] = React.useState<ProjectRow[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [newProjectName, setNewProjectName] = React.useState('')
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  const loadProjects = React.useCallback(() => {
    if (!user) return
    setIsLoading(true)
    apiCall<ProjectListResponse>('/api/anter_configurator/portal/projects?pageSize=100')
      .then((res) => {
        if (!res.ok || !res.result) {
          setError(t('anter_configurator.portal.projects.loadError', 'Failed to load your projects'))
          return
        }
        setRows(res.result.items)
      })
      .finally(() => setIsLoading(false))
  }, [user, t])

  React.useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleCreate = React.useCallback(async () => {
    if (!newProjectName.trim()) return
    setCreating(true)
    const res = await apiCall<{ item: { id: string } }>('/api/anter_configurator/portal/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ name: newProjectName.trim() }),
    })
    setCreating(false)
    if (!res.ok || !res.result) {
      flash(t('anter_configurator.portal.projects.createError', 'Could not create the project'), 'error')
      return
    }
    router.push(`/${params.orgSlug}/portal/configurator/${res.result.item.id}`)
  }, [newProjectName, router, params.orgSlug, t])

  if (loading || isLoading) return <LoadingMessage label={t('anter_configurator.portal.projects.loading', 'Loading…')} />
  if (error) return <ErrorMessage label={error} />

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={t('anter_configurator.portal.projects.title', 'Configurator')}
        description={t('anter_configurator.portal.projects.description', 'Draw your building and get quantities and a price automatically.')}
      />

      <PortalCard>
        <div className="flex items-center gap-2">
          <Input
            value={newProjectName}
            onChange={(event) => setNewProjectName(event.target.value)}
            placeholder={t('anter_configurator.portal.projects.namePlaceholder', 'New project name')}
            onKeyDown={(event) => { if (event.key === 'Enter') void handleCreate() }}
          />
          <Button type="button" onClick={handleCreate} disabled={creating || !newProjectName.trim()}>
            <Plus className="size-4" />
            {t('anter_configurator.portal.projects.create', 'New project')}
          </Button>
        </div>
      </PortalCard>

      {!rows.length ? (
        <PortalEmptyState
          icon={<Ruler className="size-8" />}
          title={t('anter_configurator.portal.projects.emptyTitle', 'No projects yet')}
          description={t('anter_configurator.portal.projects.emptyDescription', 'Create your first project and start drawing.')}
        />
      ) : (
        <div className="space-y-2">
          {rows.map((project) => (
            <button
              key={project.id}
              type="button"
              className="flex w-full items-center justify-between rounded-md border border-border bg-card px-4 py-3 text-left hover:bg-accent"
              onClick={() => router.push(`/${params.orgSlug}/portal/configurator/${project.id}`)}
            >
              <span>
                <span className="block font-medium text-foreground">{project.name}</span>
                <span className="block text-overline text-muted-foreground">{project.projectNumber}</span>
              </span>
              <StatusBadge variant={STATUS_VARIANTS[project.status] ?? 'neutral'}>{project.status}</StatusBadge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
