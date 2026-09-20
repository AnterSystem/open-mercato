import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { deleteCatalogProductIfExists } from '@open-mercato/core/helpers/integration/catalogFixtures'
import {
  createCustomerRoleFixture,
  createCustomerCompanyFixture,
  createCustomerUserFixture,
  deleteCustomerCompanyFixture,
  deleteCustomerRoleFixture,
  deleteCustomerUserFixture,
  portalLogin,
  portalCookieHeaders,
  type CustomerRoleFixture,
} from '@open-mercato/core/helpers/integration/customerAccountsFixtures'

// TC-ANTER-CFG-002: spec Implementation Plan Phase G steps 18-19 — the priced
// partner track end to end through the real portal HTTP API: create project
// → calibrate → draw a run → the server-authoritative BOM → add to cart.
// Also covers §3.6's cart block: a configuration with an unpriced (`to_quote`)
// line cannot be added to the cart.

test.describe('TC-ANTER-CFG-002: anter_configurator portal add-to-cart', () => {
  const stamp = Date.now().toString(36)
  let adminToken: string
  let tenantId: string
  let role: CustomerRoleFixture
  let companyId: string
  let barrierProductId: string

  async function createProduct(request: import('@playwright/test').APIRequestContext, sku: string, priced: boolean) {
    const productRes = await apiRequest(request, 'POST', '/api/catalog/products', {
      token: adminToken,
      data: {
        title: `QA Anter Barrier ${sku}`,
        sku,
        description: 'Long enough description for SEO checks in QA automation flows. This text keeps the create validation satisfied.',
        cf_anter_drawing_kind: 'line',
        cf_anter_module_length_m: 1.8,
        cf_anter_module_fit_policy: 'round_down',
        cf_anter_posts_per_run_extra: 1,
        cf_anter_anchors_per_post: 4,
      },
    })
    const product = await readJsonSafe<{ id?: string }>(productRes)
    const productId = product?.id as string

    if (priced) {
      const priceKindRes = await apiRequest(request, 'POST', '/api/catalog/price-kinds', {
        token: adminToken,
        data: { code: `qa_anter_cfg_${stamp}`, title: `QA Anter CFG Kind ${stamp}`, displayMode: 'excluding-tax', currencyCode: 'PLN' },
      })
      const priceKind = await readJsonSafe<{ id?: string }>(priceKindRes)
      await apiRequest(request, 'POST', '/api/catalog/prices', {
        token: adminToken,
        data: { productId, priceKindId: priceKind?.id, currencyCode: 'PLN', minQuantity: 1, unitPriceNet: 100, unitPriceGross: 123 },
      })
    }
    return productId
  }

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
    tenantId = getTokenContext(adminToken).tenantId

    role = await createCustomerRoleFixture(request, adminToken, { features: ['portal.configurator.use'] })
    companyId = await createCustomerCompanyFixture(request, adminToken, `QA Anter CFG Partner ${stamp}`)
    barrierProductId = await createProduct(request, `ANTER-CFG-PORTAL-${stamp}`, true)
  })

  test.afterAll(async ({ request }) => {
    await deleteCatalogProductIfExists(request, adminToken, barrierProductId)
    await deleteCustomerCompanyFixture(request, adminToken, companyId)
    await deleteCustomerRoleFixture(request, adminToken, role.id)
  })

  async function createPortalSession(request: import('@playwright/test').APIRequestContext) {
    const user = await createCustomerUserFixture(request, adminToken, { roleIds: [role.id], customerEntityId: companyId })
    const session = await portalLogin(request, { email: user.email, password: user.password, tenantId })
    return { user, session }
  }

  test('draws a priced run and adds it to the cart', async ({ request }) => {
    const { user, session } = await createPortalSession(request)
    try {
      const projectRes = await request.post('/api/anter_configurator/portal/projects', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { name: `QA Configurator ${stamp}` },
      })
      expect(projectRes.status(), 'project creation should succeed').toBe(201)
      const project = await readJsonSafe<{ item: { id: string; currentRevisionId: string } }>(projectRes)
      const revisionId = project!.item.currentRevisionId

      const calibrationRes = await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/calibration`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { calibrationPoints: { pointA: [0, 0], pointB: [100, 0], realDistanceM: 1 } },
      })
      expect(calibrationRes.status(), 'calibration should succeed').toBe(200)

      const elementsRes = await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/elements`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { elements: [{ elementKind: 'run', productId: barrierProductId, geometry: { vertices: [[0, 0], [4200, 0]] }, sortOrder: 0 }] },
      })
      expect(elementsRes.status(), 'element replace should succeed').toBe(200)
      const elementsBody = await readJsonSafe<{ bom: { lines: Array<{ moduleCount: number | null; priceState: string }> } }>(elementsRes)
      const barrierLine = elementsBody!.bom.lines.find((line) => line.moduleCount != null)
      expect(barrierLine?.moduleCount).toBe(23)
      expect(barrierLine?.priceState).toBe('priced')

      const addToCartRes = await request.post(`/api/anter_configurator/portal/revisions/${revisionId}/add-to-cart`, {
        headers: portalCookieHeaders(session),
      })
      expect(addToCartRes.status(), 'add-to-cart should succeed once every line is priced').toBe(200)
      const addToCartBody = await readJsonSafe<{ item: { cartId: string; lineCount: number } }>(addToCartRes)
      expect(addToCartBody?.item?.cartId).toBeTruthy()
      expect(addToCartBody?.item?.lineCount).toBeGreaterThan(0)

      const cartRes = await request.get('/api/anter_portal/cart', { headers: portalCookieHeaders(session) })
      expect(cartRes.status()).toBe(200)
      const cart = await readJsonSafe<{ lines: Array<{ productId: string }> }>(cartRes)
      expect(cart?.lines.some((line) => line.productId === barrierProductId)).toBe(true)
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })

  test('refuses to add an unpriced configuration to the cart (§3.6)', async ({ request }) => {
    const unpricedProductId = await createProduct(request, `ANTER-CFG-UNPRICED-${stamp}`, false)
    const { user, session } = await createPortalSession(request)
    try {
      const projectRes = await request.post('/api/anter_configurator/portal/projects', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { name: `QA Configurator Unpriced ${stamp}` },
      })
      const project = await readJsonSafe<{ item: { id: string; currentRevisionId: string } }>(projectRes)
      const revisionId = project!.item.currentRevisionId

      await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/calibration`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { calibrationPoints: { pointA: [0, 0], pointB: [100, 0], realDistanceM: 1 } },
      })
      await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/elements`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { elements: [{ elementKind: 'run', productId: unpricedProductId, geometry: { vertices: [[0, 0], [4200, 0]] }, sortOrder: 0 }] },
      })

      const addToCartRes = await request.post(`/api/anter_configurator/portal/revisions/${revisionId}/add-to-cart`, {
        headers: portalCookieHeaders(session),
      })
      expect(addToCartRes.status()).toBe(409)
      const body = await readJsonSafe<{ error: string; suggestedAction: string }>(addToCartRes)
      expect(body?.error).toBe('configuration_not_orderable')
      expect(body?.suggestedAction).toBe('quote_request')
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
      await deleteCatalogProductIfExists(request, adminToken, unpricedProductId)
    }
  })
})
