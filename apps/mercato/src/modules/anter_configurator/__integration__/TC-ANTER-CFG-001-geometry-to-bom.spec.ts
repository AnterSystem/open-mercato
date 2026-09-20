import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { deleteCatalogProductIfExists } from '@open-mercato/core/helpers/integration/catalogFixtures'

// TC-ANTER-CFG-001: spec Implementation Plan Phase F (geometry foundations),
// §Test coverage fixture "Straight 42.0 m run, 1.8 m module, round_down".
// Exercises the real HTTP path — product geometry custom fields (§3.3) →
// project + revision creation → whole-revision element replace → the
// server-authoritative BOM (§3.5, C4) — rather than only the pure-function
// unit tests in `services/__tests__/`.

test.describe('TC-ANTER-CFG-001: anter_configurator geometry -> BOM', () => {
  const stamp = Date.now().toString(36)
  let adminToken: string
  let barrierProductId: string
  let barrierSku: string
  let postSku: string
  let anchorSku: string
  let priceKindId: string | null = null
  let projectId: string | null = null
  let revisionId: string | null = null

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')

    barrierSku = `ANTER-CFG-BARRIER-${stamp}`
    postSku = `ANTER-CFG-POST-${stamp}`
    anchorSku = `ANTER-CFG-ANCHOR-${stamp}`

    const barrierResponse = await apiRequest(request, 'POST', '/api/catalog/products', {
      token: adminToken,
      data: {
        title: `QA Anter Barrier ${stamp}`,
        sku: barrierSku,
        description: 'Long enough description for SEO checks in QA automation flows. This text keeps the create validation satisfied.',
        cf_anter_drawing_kind: 'line',
        cf_anter_module_length_m: 1.8,
        cf_anter_module_fit_policy: 'round_down',
        cf_anter_post_sku: postSku,
        cf_anter_posts_per_run_extra: 1,
        cf_anter_anchor_sku: anchorSku,
        cf_anter_anchors_per_post: 4,
      },
    })
    expect(barrierResponse.ok(), `Failed to create barrier product fixture: ${barrierResponse.status()}`).toBeTruthy()
    barrierProductId = ((await barrierResponse.json()) as { id: string }).id

    for (const sku of [postSku, anchorSku]) {
      const response = await apiRequest(request, 'POST', '/api/catalog/products', {
        token: adminToken,
        data: {
          title: `QA Anter Accessory ${sku}`,
          sku,
          description: 'Long enough description for SEO checks in QA automation flows. This text keeps the create validation satisfied.',
        },
      })
      expect(response.ok(), `Failed to create accessory product fixture ${sku}: ${response.status()}`).toBeTruthy()
    }

    const priceKindsResponse = await apiRequest(request, 'GET', '/api/catalog/price-kinds?page=1&pageSize=1', { token: adminToken })
    const priceKindsBody = (await priceKindsResponse.json().catch(() => null)) as { items?: Array<{ id: string }> } | null
    priceKindId = priceKindsBody?.items?.[0]?.id ?? null
    if (priceKindId) {
      await apiRequest(request, 'POST', '/api/catalog/prices', {
        token: adminToken,
        data: { productId: barrierProductId, currencyCode: 'PLN', priceKindId, unitPriceNet: 100 },
      })
    }
  })

  test.afterAll(async ({ request }) => {
    await deleteCatalogProductIfExists(request, adminToken, barrierProductId)
    for (const sku of [postSku, anchorSku]) {
      const listResponse = await apiRequest(request, 'GET', `/api/catalog/products?sku=${sku}`, { token: adminToken })
      const body = (await listResponse.json().catch(() => null)) as { items?: Array<{ id: string }> } | null
      const id = body?.items?.[0]?.id
      if (id) await deleteCatalogProductIfExists(request, adminToken, id)
    }
    // Phase F has no delete route for `anter_configurator` projects yet
    // (Implementation Plan step 9 is a read-only back-office view); the
    // project/revision/BOM rows created here are left in place, matching the
    // scope this phase ships.
  })

  test('creates a project, draws a 42.0 m run and recomputes an authoritative BOM', async ({ request }) => {
    const createResponse = await apiRequest(request, 'POST', '/api/anter_configurator/projects', {
      token: adminToken,
      data: { name: `QA Configurator Project ${stamp}`, origin: 'internal' },
    })
    expect(createResponse.ok(), `Failed to create project: ${createResponse.status()}`).toBeTruthy()
    const created = (await createResponse.json()) as { item: { id: string; currentRevisionId: string } }
    projectId = created.item.id
    revisionId = created.item.currentRevisionId
    expect(projectId).toBeTruthy()
    expect(revisionId).toBeTruthy()

    // Calibrate so 100 plan units == 1 metre (matches the fixture's plain-metre run).
    const calibrationResponse = await apiRequest(request, 'PUT', `/api/anter_configurator/revisions/${revisionId}/calibration`, {
      token: adminToken,
      data: { calibrationPoints: { pointA: [0, 0], pointB: [100, 0], realDistanceM: 1 } },
    })
    expect(calibrationResponse.ok(), `Failed to calibrate revision: ${calibrationResponse.status()}`).toBeTruthy()

    const elementsResponse = await apiRequest(request, 'PUT', `/api/anter_configurator/revisions/${revisionId}/elements`, {
      token: adminToken,
      data: {
        elements: [
          {
            elementKind: 'run',
            productId: barrierProductId,
            geometry: { vertices: [[0, 0], [4200, 0]] },
            sortOrder: 0,
          },
        ],
      },
    })
    expect(elementsResponse.ok(), `Failed to replace elements: ${elementsResponse.status()}`).toBeTruthy()
    const elementsBody = (await elementsResponse.json()) as { bom: { lines: Array<Record<string, unknown>> } | null }

    const bomResponse = await apiRequest(request, 'GET', `/api/anter_configurator/revisions/${revisionId}/bom`, { token: adminToken })
    expect(bomResponse.ok(), `Failed to read BOM: ${bomResponse.status()}`).toBeTruthy()
    const bom = (await bomResponse.json()) as {
      item: { lines: Array<{ productId: string; moduleCount: number | null; realisedLengthM: number | null; residualLengthM: number | null; postCount: number | null; anchorCount: number | null; priceState: string; netAmount: number | null }> }
    }

    const barrierLine = bom.item.lines.find((line) => line.productId === barrierProductId)
    expect(barrierLine, 'barrier line should exist in the recomputed BOM').toBeTruthy()
    expect(barrierLine!.moduleCount).toBe(23)
    expect(barrierLine!.realisedLengthM).toBe(41.4)
    expect(barrierLine!.residualLengthM).toBe(0.6)
    expect(barrierLine!.postCount).toBe(24)
    expect(barrierLine!.anchorCount).toBe(96)
    if (priceKindId) {
      expect(barrierLine!.priceState).toBe('priced')
      expect(barrierLine!.netAmount).toBe(2300)
    }

    expect(bom.item.lines.some((line) => line.priceState === 'to_quote')).toBe(true)
    void elementsBody
  })
})
