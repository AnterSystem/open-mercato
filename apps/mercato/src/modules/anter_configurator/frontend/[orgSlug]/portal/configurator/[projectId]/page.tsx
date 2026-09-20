"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalCard, PortalCardHeader } from '@open-mercato/ui/portal/components/PortalCard'
import { PlanCanvas } from '../../../../../components/PlanCanvas'
import { CalibrationDialog } from '../../../../../components/CalibrationDialog'
import { BomPanel, type ServerBom } from '../../../../../components/BomPanel'
import { CoverageCard, type PlanPointView } from '../../../../../components/CoverageCard'
import type { ElementDraft, ProductOption, Vertex } from '../../../../../components/types'
import type { AnterProductGeometry } from '../../../../../services/anterBomService'

type Props = { params: { orgSlug: string; projectId: string } }

type Project = { id: string; projectNumber: string; name: string; currentRevisionId: string | null }
type Revision = {
  id: string
  state: string
  underlayAttachmentId: string | null
  underlayWidthUnits: number | null
  underlayHeightUnits: number | null
  metresPerUnit: number | null
  gridSizeM: number
  hasUnpricedItems: boolean
  updatedAt: string
  mode: 'partner_priced' | 'partner_unpriced'
}
type DrawableProduct = ProductOption & Omit<AnterProductGeometry, 'productId' | 'productVariantId'>
type DeniedInfo = { contactOwnerName: string | null; contactOwnerEmail: string | null }

type ElementsMutationContext = {
  moduleId: string
  entityId: string
  operation: string
  resourceKind: string
  resourceId: string
  formId: string
  retryLastMutation: () => Promise<boolean>
}

export default function AnterConfiguratorPortalWorkspacePage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [project, setProject] = React.useState<Project | null>(null)
  const [revision, setRevision] = React.useState<Revision | null>(null)
  const [elements, setElements] = React.useState<ElementDraft[]>([])
  const [products, setProducts] = React.useState<DrawableProduct[]>([])
  const [points, setPoints] = React.useState<PlanPointView[]>([])
  const [serverBom, setServerBom] = React.useState<ServerBom | null>(null)
  const [selectedProductId, setSelectedProductId] = React.useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = React.useState<string | null>(null)
  const [calibrationOpen, setCalibrationOpen] = React.useState(false)
  const [isCalibrating, setIsCalibrating] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [deniedInfo, setDeniedInfo] = React.useState<DeniedInfo | null>(null)

  const saveMutation = useGuardedMutation<ElementsMutationContext>({ contextId: 'anter_configurator.revision.elements.replace' })
  const calibrationMutation = useGuardedMutation<ElementsMutationContext>({ contextId: 'anter_configurator.revision.calibration' })
  const cartMutation = useGuardedMutation<ElementsMutationContext>({ contextId: 'anter_configurator.revision.add_to_cart' })
  const quoteRequestMutation = useGuardedMutation<ElementsMutationContext>({ contextId: 'anter_configurator.revision.quote_request' })

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  const loadWorkspace = React.useCallback(async () => {
    if (!user) return
    setIsLoading(true)
    setError(null)
    setDeniedInfo(null)

    const projectRes = await apiCall<{ items: Project[] }>(`/api/anter_configurator/portal/projects?id=${params.projectId}`)
    if (projectRes.status === 403) {
      setDeniedInfo(projectRes.result as unknown as DeniedInfo)
      setIsLoading(false)
      return
    }
    const loadedProject = projectRes.ok ? projectRes.result?.items?.[0] : null
    if (!loadedProject || !loadedProject.currentRevisionId) {
      setError(t('anter_configurator.portal.workspace.loadError', 'Failed to load the project'))
      setIsLoading(false)
      return
    }
    setProject(loadedProject)

    const [revisionRes, elementsRes, productsRes, pointsRes] = await Promise.all([
      apiCall<{ item: Revision }>(`/api/anter_configurator/portal/revisions/${loadedProject.currentRevisionId}`),
      apiCall<{ items: ElementDraft[] }>(`/api/anter_configurator/portal/revisions/${loadedProject.currentRevisionId}/elements`),
      apiCall<{ items: DrawableProduct[] }>('/api/anter_configurator/portal/drawable-products'),
      apiCall<{ items: PlanPointView[] }>(`/api/anter_configurator/portal/revisions/${loadedProject.currentRevisionId}/points`),
    ])
    if (revisionRes.status === 403) {
      setDeniedInfo(revisionRes.result as unknown as DeniedInfo)
      setIsLoading(false)
      return
    }
    if (revisionRes.ok && revisionRes.result) setRevision(revisionRes.result.item)
    if (elementsRes.ok && elementsRes.result) setElements(elementsRes.result.items)
    if (productsRes.ok && productsRes.result) {
      setProducts(productsRes.result.items)
      setSelectedProductId((current) => current ?? productsRes.result!.items[0]?.id ?? null)
    }
    if (pointsRes.ok && pointsRes.result) setPoints(pointsRes.result.items)

    if (revisionRes.ok && revisionRes.result?.item.metresPerUnit != null) {
      const bomRes = await apiCall<{ item: ServerBom }>(`/api/anter_configurator/portal/revisions/${loadedProject.currentRevisionId}/bom`)
      if (bomRes.ok && bomRes.result) setServerBom(bomRes.result.item)
    }

    setIsLoading(false)
  }, [user, params.projectId, t])

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
        () => apiCall<{ item: { revisionId: string } }>(`/api/anter_configurator/portal/revisions/${revision.id}/elements`, {
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
        formId: 'anter_configurator.revision.elements.replace',
        retryLastMutation: saveMutation.retryLastMutation,
      },
      mutationPayload: { elementCount: elements.length },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_configurator.portal.workspace.saveError', 'Could not save the drawing'), 'error')
      return
    }
    // The PUT response only carries a terse aggregate; the full, mode-redacted
    // line list is a separate GET so this page never duplicates that
    // redaction logic (§3.7 rule 2 lives in exactly one place: `bom/route.ts`).
    await loadWorkspace()
  }, [revision, elements, saveMutation, loadWorkspace, t])

  const handleCalibrate = React.useCallback(async (input: { pointA: Vertex; pointB: Vertex; realDistanceM: number }) => {
    if (!revision) return
    setIsCalibrating(true)
    const result = await calibrationMutation.runMutation({
      operation: () => withScopedApiRequestHeaders(
        buildOptimisticLockHeader(revision.updatedAt),
        () => apiCall<{ item: unknown }>(`/api/anter_configurator/portal/revisions/${revision.id}/calibration`, {
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
        formId: 'anter_configurator.revision.calibration',
        retryLastMutation: calibrationMutation.retryLastMutation,
      },
      mutationPayload: input,
    })
    setIsCalibrating(false)
    if (!result.ok) {
      flash(t('anter_configurator.portal.workspace.calibrateError', 'Could not calibrate the plan'), 'error')
      return
    }
    setCalibrationOpen(false)
    await loadWorkspace()
  }, [revision, calibrationMutation, loadWorkspace, t])

  const handleAddToCart = React.useCallback(async () => {
    if (!revision) return
    const result = await cartMutation.runMutation({
      operation: () => apiCall<{ item: { cartId: string } }>(`/api/anter_configurator/portal/revisions/${revision.id}/add-to-cart`, {
        method: 'POST',
        credentials: 'include',
      }),
      context: {
        moduleId: 'anter_configurator',
        entityId: 'anter_configurator.revision',
        operation: 'add_to_cart',
        resourceKind: 'anter_configurator.revision',
        resourceId: revision.id,
        formId: 'anter_configurator.revision.add_to_cart',
        retryLastMutation: cartMutation.retryLastMutation,
      },
    })
    if (!result.ok) {
      flash(t('anter_configurator.portal.workspace.addToCartError', 'This configuration cannot be added to the cart yet — some items still need a price'), 'error')
      return
    }
    flash(t('anter_configurator.portal.workspace.addToCartSuccess', 'Added to your cart'), 'success')
    router.push(`/${params.orgSlug}/portal/cart`)
  }, [revision, cartMutation, router, params.orgSlug, t])

  const handleQuoteRequest = React.useCallback(async () => {
    if (!revision) return
    const result = await quoteRequestMutation.runMutation({
      operation: () => apiCall<{ item: { submissionNumber: string } }>(`/api/anter_configurator/portal/revisions/${revision.id}/quote-request`, {
        method: 'POST',
        credentials: 'include',
      }),
      context: {
        moduleId: 'anter_configurator',
        entityId: 'anter_configurator.submission',
        operation: 'create',
        resourceKind: 'anter_configurator.submission',
        resourceId: revision.id,
        formId: 'anter_configurator.revision.quote_request',
        retryLastMutation: quoteRequestMutation.retryLastMutation,
      },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_configurator.portal.workspace.quoteRequestError', 'Could not send the quote request'), 'error')
      return
    }
    flash(t('anter_configurator.portal.workspace.quoteRequestSuccess', 'Quote request sent'), 'success')
    await loadWorkspace()
  }, [revision, quoteRequestMutation, loadWorkspace, t])

  const handleUnderlayUpload = React.useCallback(async (file: File) => {
    if (!project) return
    const form = new FormData()
    form.append('file', file)
    const res = await apiCall<{ item: { attachmentId: string } }>(`/api/anter_configurator/portal/projects/${project.id}/underlay`, {
      method: 'POST',
      credentials: 'include',
      body: form,
    })
    if (!res.ok) {
      flash(t('anter_configurator.portal.workspace.underlayError', 'Could not upload the plan'), 'error')
      return
    }
    await loadWorkspace()
  }, [project, loadWorkspace, t])

  if (loading || isLoading) return <LoadingMessage label={t('anter_configurator.portal.workspace.loading', 'Loading…')} />
  if (deniedInfo) {
    return (
      <PortalCard>
        <PortalCardHeader title={t('anter_configurator.portal.workspace.deniedTitle', 'Configurator unavailable for this account')} />
        <p className="text-sm text-muted-foreground">
          {t('anter_configurator.portal.workspace.deniedDescription', 'Contact your account owner to enable the configurator.')}
        </p>
        {deniedInfo.contactOwnerName || deniedInfo.contactOwnerEmail ? (
          <p className="mt-2 text-sm text-foreground">
            {deniedInfo.contactOwnerName ?? deniedInfo.contactOwnerEmail}
            {deniedInfo.contactOwnerEmail ? ` — ${deniedInfo.contactOwnerEmail}` : ''}
          </p>
        ) : null}
      </PortalCard>
    )
  }
  if (error || !project || !revision) return <ErrorMessage label={error ?? t('anter_configurator.portal.workspace.loadError', 'Failed to load the project')} />

  const underlayUrl = revision.underlayAttachmentId ? `/api/anter_configurator/portal/revisions/${revision.id}/underlay` : null

  return (
    <div className="space-y-6">
      <PortalPageHeader title={project.name} description={project.projectNumber} />

      {!underlayUrl ? (
        <PortalCard>
          <PortalCardHeader title={t('anter_configurator.portal.workspace.uploadTitle', 'Upload your site plan')} />
          <input
            type="file"
            accept="image/png,image/jpeg,application/pdf"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUnderlayUpload(file) }}
          />
        </PortalCard>
      ) : revision.metresPerUnit == null ? (
        <PortalCard>
          <PortalCardHeader title={t('anter_configurator.portal.workspace.calibrateTitle', 'Calibrate the plan before drawing')} />
          <Button type="button" onClick={() => setCalibrationOpen(true)}>
            {t('anter_configurator.portal.workspace.calibrateAction', 'Calibrate')}
          </Button>
        </PortalCard>
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
                {t('anter_configurator.portal.workspace.recalibrate', 'Recalibrate')}
              </Button>
            </div>
            <PlanCanvas
              elements={elements}
              onElementsChange={setElements}
              underlayUrl={underlayUrl}
              underlayWidthUnits={revision.underlayWidthUnits}
              underlayHeightUnits={revision.underlayHeightUnits}
              gridSizeM={revision.gridSizeM}
              metresPerUnit={revision.metresPerUnit}
              activeProductId={selectedProductId}
              selectedElementId={selectedElementId}
              onSelectedElementChange={setSelectedElementId}
              readOnly={revision.state !== 'draft'}
            />
            <div className="mt-2 flex justify-end">
              <Button type="button" onClick={handleSave} disabled={revision.state !== 'draft'}>
                {t('anter_configurator.portal.workspace.save', 'Save drawing')}
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <PortalCard>
              <PortalCardHeader title={t('anter_configurator.portal.workspace.coverageTitle', 'Coverage')} />
              <CoverageCard points={points} />
            </PortalCard>
            <PortalCard>
              <PortalCardHeader title={t('anter_configurator.portal.workspace.bomTitle', 'Bill of materials')} />
              <BomPanel
                elements={elements}
                metresPerUnit={revision.metresPerUnit}
                productGeometryByProductId={productGeometryByProductId}
                serverBom={serverBom}
              />
              {revision.mode === 'partner_unpriced' ? (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={handleQuoteRequest}
                  disabled={revision.state !== 'draft' || !elements.length}
                >
                  {t('anter_configurator.portal.workspace.quoteRequest', 'Send quote request')}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={handleAddToCart}
                  disabled={!serverBom || serverBom.hasUnpricedItems}
                >
                  {t('anter_configurator.portal.workspace.addToCart', 'Add to cart')}
                </Button>
              )}
            </PortalCard>
          </div>
        </div>
      )}

      <CalibrationDialog
        open={calibrationOpen}
        onOpenChange={setCalibrationOpen}
        onSubmit={handleCalibrate}
        submitting={isCalibrating}
      />
    </div>
  )
}
