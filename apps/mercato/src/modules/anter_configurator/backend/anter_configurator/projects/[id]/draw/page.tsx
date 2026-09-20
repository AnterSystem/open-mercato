"use client"

import * as React from 'react'
import { useParams } from 'next/navigation'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PlanCanvas } from '../../../../../components/PlanCanvas'
import { CalibrationDialog } from '../../../../../components/CalibrationDialog'
import { BomPanel, type ServerBom } from '../../../../../components/BomPanel'
import type { ElementDraft, ProductOption, Vertex } from '../../../../../components/types'
import type { AnterProductGeometry } from '../../../../../services/anterBomService'

type Project = { id: string; name: string; customer_entity_id: string | null }
type Revision = {
  id: string
  state: string
  underlay_attachment_id: string | null
  underlay_width_units: number | null
  underlay_height_units: number | null
  metres_per_unit: number | null
  grid_size_m: number
  updatedAt: string
}
type DrawableProduct = ProductOption & Omit<AnterProductGeometry, 'productId' | 'productVariantId'>

type MutationContext = {
  moduleId: string
  entityId: string
  operation: string
  resourceKind: string
  resourceId: string
  formId: string
  retryLastMutation: () => Promise<boolean>
}

/**
 * Internal-mode workspace (spec s9, Implementation Plan Phase H step 26):
 * the SAME `PlanCanvas`/`BomPanel`/`CalibrationDialog` the portal uses (one
 * engine, §3.7 rule 1) — the full catalogue, dashed out-of-price-list
 * elements, and cost/margin rows behind `anter_configurator.margin.view`
 * (enforced server-side by the BOM route, not by this page).
 */
export default function AnterConfiguratorDrawPage() {
  const t = useT()
  const params = useParams<{ id: string }>()
  const projectId = params?.id as string

  const [project, setProject] = React.useState<Project | null>(null)
  const [revision, setRevision] = React.useState<Revision | null>(null)
  const [elements, setElements] = React.useState<ElementDraft[]>([])
  const [products, setProducts] = React.useState<DrawableProduct[]>([])
  const [serverBom, setServerBom] = React.useState<ServerBom | null>(null)
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>(null)
  const [calibrationOpen, setCalibrationOpen] = React.useState(false)
  const [isCalibrating, setIsCalibrating] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const saveMutation = useGuardedMutation<MutationContext>({ contextId: 'anter_configurator.revision.elements.replace.internal' })
  const calibrationMutation = useGuardedMutation<MutationContext>({ contextId: 'anter_configurator.revision.calibration.internal' })

  const loadWorkspace = React.useCallback(async () => {
    if (!projectId) return
    setIsLoading(true)
    setError(null)

    const projectRes = await apiCall<{ items: Project[] }>(`/api/anter_configurator/projects?id=${projectId}`)
    const loadedProject = projectRes.ok ? projectRes.result?.items?.[0] : null
    if (!loadedProject) {
      setError(t('anter_configurator.backend.draw.loadError', 'Failed to load the project'))
      setIsLoading(false)
      return
    }
    setProject(loadedProject)

    const revisionsRes = await apiCall<{ items: Revision[] }>(`/api/anter_configurator/revisions?projectId=${projectId}&pageSize=1`)
    const loadedRevision = revisionsRes.ok ? revisionsRes.result?.items?.[0] : null
    if (!loadedRevision) {
      setError(t('anter_configurator.backend.draw.loadError', 'Failed to load the project'))
      setIsLoading(false)
      return
    }
    setRevision(loadedRevision)

    const [elementsRes, productsRes] = await Promise.all([
      apiCall<{ items: ElementDraft[] }>(`/api/anter_configurator/revisions/${loadedRevision.id}/elements`),
      apiCall<{ items: DrawableProduct[] }>('/api/anter_configurator/drawable-products'),
    ])
    if (elementsRes.ok && elementsRes.result) setElements(elementsRes.result.items)
    if (productsRes.ok && productsRes.result) {
      setProducts(productsRes.result.items)
      setSelectedProductId((current) => current ?? productsRes.result!.items[0]?.id ?? null)
    }

    if (loadedRevision.metres_per_unit != null) {
      const bomRes = await apiCall<{ item: ServerBom }>(`/api/anter_configurator/revisions/${loadedRevision.id}/bom`)
      if (bomRes.ok && bomRes.result) setServerBom(bomRes.result.item)
    }

    setIsLoading(false)
  }, [projectId, t])

  React.useEffect(() => {
    void loadWorkspace()
  }, [loadWorkspace])

  const productGeometryByProductId = React.useMemo(() => {
    const map: Record<string, AnterProductGeometry> = {}
    for (const product of products) {
      map[product.id] = {
        productId: product.id,
        productVariantId: null,
        drawingKind: product.drawingKind,
        moduleLengthM: product.moduleLengthM,
        moduleFitPolicy: product.moduleFitPolicy,
        postSku: product.postSku,
        postsPerRunExtra: product.postsPerRunExtra,
        anchorSku: product.anchorSku,
        anchorsPerPost: product.anchorsPerPost,
        insertClearWidthM: product.insertClearWidthM,
      }
    }
    return map
  }, [products])

  const handleSave = React.useCallback(async () => {
    if (!revision) return
    const result = await saveMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(revision.updatedAt),
        () => apiCall<{ item: { revisionId: string } }>(`/api/anter_configurator/revisions/${revision.id}/elements`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ elements }),
        }),
      ),
      context: {
        moduleId: 'anter_configurator',
        entityId: 'anter_configurator.revision',
        operation: 'update',
        resourceKind: 'anter_configurator.revision',
        resourceId: revision.id,
        formId: 'anter_configurator.revision.elements.replace.internal',
        retryLastMutation: saveMutation.retryLastMutation,
      },
      mutationPayload: { elementCount: elements.length },
    })
    if (!result.ok) {
      flash(t('anter_configurator.backend.draw.saveError', 'Could not save the drawing'), 'error')
      return
    }
    await loadWorkspace()
  }, [revision, elements, saveMutation, loadWorkspace, t])

  const handleCalibrate = React.useCallback(async (input: { pointA: Vertex; pointB: Vertex; realDistanceM: number }) => {
    if (!revision) return
    setIsCalibrating(true)
    const result = await calibrationMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(revision.updatedAt),
        () => apiCall<{ item: unknown }>(`/api/anter_configurator/revisions/${revision.id}/calibration`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ calibrationPoints: input }),
        }),
      ),
      context: {
        moduleId: 'anter_configurator',
        entityId: 'anter_configurator.revision',
        operation: 'update',
        resourceKind: 'anter_configurator.revision',
        resourceId: revision.id,
        formId: 'anter_configurator.revision.calibration.internal',
        retryLastMutation: calibrationMutation.retryLastMutation,
      },
      mutationPayload: input,
    })
    setIsCalibrating(false)
    if (!result.ok) {
      flash(t('anter_configurator.backend.draw.calibrateError', 'Could not calibrate the plan'), 'error')
      return
    }
    setCalibrationOpen(false)
    await loadWorkspace()
  }, [revision, calibrationMutation, loadWorkspace, t])

  if (isLoading) return <LoadingMessage label={t('anter_configurator.backend.draw.loading', 'Loading…')} />
  if (error || !project || !revision) return <ErrorMessage label={error ?? t('anter_configurator.backend.draw.loadError', 'Failed to load the project')} />

  const underlayUrl = revision.underlay_attachment_id ? `/api/anter_configurator/revisions/${revision.id}/underlay` : null

  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-foreground">{project.name}</h1>
        </div>

        {revision.metres_per_unit == null ? (
          <div className="rounded-xl border border-border p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              {t('anter_configurator.backend.draw.calibrateTitle', 'Calibrate the plan before drawing')}
            </p>
            <Button type="button" onClick={() => setCalibrationOpen(true)}>
              {t('anter_configurator.backend.draw.calibrateAction', 'Calibrate')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {products.map((product) => (
                  <Button
                    key={product.id}
                    type="button"
                    variant={selectedProductId === product.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedProductId(product.id)}
                  >
                    {product.title}
                  </Button>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setCalibrationOpen(true)}>
                  {t('anter_configurator.backend.draw.recalibrate', 'Recalibrate')}
                </Button>
              </div>
              <PlanCanvas
                elements={elements}
                onElementsChange={setElements}
                underlayUrl={underlayUrl}
                underlayWidthUnits={revision.underlay_width_units}
                underlayHeightUnits={revision.underlay_height_units}
                gridSizeM={revision.grid_size_m}
                metresPerUnit={revision.metres_per_unit}
                activeProductId={selectedProductId}
                selectedElementId={selectedElementId}
                onSelectedElementChange={setSelectedElementId}
                readOnly={revision.state !== 'draft'}
              />
              <div className="mt-2 flex justify-end">
                <Button type="button" onClick={handleSave} disabled={revision.state !== 'draft'}>
                  {t('anter_configurator.backend.draw.save', 'Save drawing')}
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-border p-4">
                <h2 className="mb-2 text-sm font-medium text-foreground">
                  {t('anter_configurator.backend.draw.bomTitle', 'Bill of materials')}
                </h2>
                <BomPanel
                  elements={elements}
                  metresPerUnit={revision.metres_per_unit}
                  productGeometryByProductId={productGeometryByProductId}
                  serverBom={serverBom}
                />
              </div>
            </div>
          </div>
        )}

        <CalibrationDialog
          open={calibrationOpen}
          onOpenChange={setCalibrationOpen}
          onSubmit={handleCalibrate}
          submitting={isCalibrating}
        />
      </PageBody>
    </Page>
  )
}
