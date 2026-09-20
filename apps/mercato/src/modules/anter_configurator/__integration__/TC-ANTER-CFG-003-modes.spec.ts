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

// TC-ANTER-CFG-003: spec Implementation Plan Phase H step 24 — the four mode
// resolutions (§3.7, C3): a `preview` account is denied even holding
// `portal.configurator.use` (explained, not blank — s12's principle), and a
// `hidden` account can create a project and draw, but the BOM response never
// carries a price key (§3.7 rule 2, R6).

test.describe('TC-ANTER-CFG-003: anter_configurator modes', () => {
  const stamp = Date.now().toString(36)
  let adminToken: string
  let tenantId: string
  let role: CustomerRoleFixture
  let companyId: string
  let partnerTermsId: string | null = null
  let barrierProductId: string

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
    tenantId = getTokenContext(adminToken).tenantId
    role = await createCustomerRoleFixture(request, adminToken, { features: ['portal.configurator.use'] })
    companyId = await createCustomerCompanyFixture(request, adminToken, `QA Anter Mode Partner ${stamp}`)

    const productRes = await apiRequest(request, 'POST', '/api/catalog/products', {
      token: adminToken,
      data: {
        title: `QA Anter Mode Barrier ${stamp}`,
        sku: `ANTER-CFG-MODE-${stamp}`,
        description: 'Long enough description for SEO checks in QA automation flows. This text keeps the create validation satisfied.',
        cf_anter_drawing_kind: 'line',
        cf_anter_module_length_m: 1.8,
        cf_anter_module_fit_policy: 'round_down',
        cf_anter_posts_per_run_extra: 1,
        cf_anter_anchors_per_post: 4,
      },
    })
    const product = await readJsonSafe<{ id?: string }>(productRes)
    barrierProductId = product?.id as string

    const priceKindRes = await apiRequest(request, 'POST', '/api/catalog/price-kinds', {
      token: adminToken,
      data: { code: `qa_anter_mode_${stamp}`, title: `QA Anter Mode Kind ${stamp}`, displayMode: 'excluding-tax', currencyCode: 'PLN' },
    })
    const priceKind = await readJsonSafe<{ id?: string }>(priceKindRes)
    await apiRequest(request, 'POST', '/api/catalog/prices', {
      token: adminToken,
      data: { productId: barrierProductId, priceKindId: priceKind?.id, currencyCode: 'PLN', minQuantity: 1, unitPriceNet: 100, unitPriceGross: 123 },
    })
  })

  test.afterAll(async ({ request }) => {
    if (partnerTermsId) {
      await apiRequest(request, 'DELETE', '/api/anter_orders/partner-terms', { token: adminToken, data: { id: partnerTermsId } })
    }
    await deleteCatalogProductIfExists(request, adminToken, barrierProductId)
    await deleteCustomerCompanyFixture(request, adminToken, companyId)
    await deleteCustomerRoleFixture(request, adminToken, role.id)
  })

  async function setAccountType(request: import('@playwright/test').APIRequestContext, accountType: 'full' | 'hidden' | 'preview') {
    if (partnerTermsId) {
      await apiRequest(request, 'PUT', '/api/anter_orders/partner-terms', { token: adminToken, data: { id: partnerTermsId, accountType } })
      return
    }
    const res = await apiRequest(request, 'POST', '/api/anter_orders/partner-terms', {
      token: adminToken,
      data: { customerEntityId: companyId, defaultDiscountRate: 0, accountType },
    })
    const created = await readJsonSafe<{ id?: string }>(res)
    partnerTermsId = created?.id ?? null
  }

  async function createPortalSession(request: import('@playwright/test').APIRequestContext) {
    const user = await createCustomerUserFixture(request, adminToken, { roleIds: [role.id], customerEntityId: companyId })
    const session = await portalLogin(request, { email: user.email, password: user.password, tenantId })
    return { user, session }
  }

  test('denies a preview account with a named contact, even though it holds portal.configurator.use', async ({ request }) => {
    await setAccountType(request, 'preview')
    const { user, session } = await createPortalSession(request)
    try {
      const res = await request.get('/api/anter_configurator/portal/projects', { headers: portalCookieHeaders(session) })
      expect(res.status()).toBe(403)
      const body = await readJsonSafe<{ error: string; missing: string; accountType: string }>(res)
      expect(body?.error).toBe('configurator_unavailable')
      expect(body?.missing).toBe('account_type')
      expect(body?.accountType).toBe('preview')
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })

  test('a hidden account can create a project but never sees a price key on its BOM', async ({ request }) => {
    await setAccountType(request, 'hidden')
    const { user, session } = await createPortalSession(request)
    try {
      const projectRes = await request.post('/api/anter_configurator/portal/projects', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { name: `QA Hidden Project ${stamp}` },
      })
      expect(projectRes.status()).toBe(201)
      const project = await readJsonSafe<{ item: { currentRevisionId: string } }>(projectRes)
      const revisionId = project!.item.currentRevisionId

      const revisionRes = await request.get(`/api/anter_configurator/portal/revisions/${revisionId}`, { headers: portalCookieHeaders(session) })
      expect(revisionRes.status()).toBe(200)
      const revision = await readJsonSafe<{ item: { mode: string } }>(revisionRes)
      expect(revision?.item?.mode).toBe('partner_unpriced')

      await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/calibration`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { calibrationPoints: { pointA: [0, 0], pointB: [100, 0], realDistanceM: 1 } },
      })
      const elementsRes = await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/elements`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { elements: [{ elementKind: 'run', productId: barrierProductId, geometry: { vertices: [[0, 0], [4200, 0]] }, sortOrder: 0 }] },
      })
      expect(elementsRes.status()).toBe(200)

      // The priced product resolves a real price server-side (proven by the
      // `partner_priced` fixture in TC-ANTER-CFG-002); the redaction here is
      // proven by its ABSENCE below, not by there being nothing to redact.
      const bomRes = await request.get(`/api/anter_configurator/portal/revisions/${revisionId}/bom`, { headers: portalCookieHeaders(session) })
      expect(bomRes.status()).toBe(200)
      const bomText = await bomRes.text()
      expect(bomText).toContain('"moduleCount":23')
      expect(bomText).not.toContain('partnerUnitPriceNet')
      expect(bomText).not.toContain('netAmount')
      expect(bomText).not.toContain('unitCostNet')

      // The priced-track action is unavailable on an unpriced account.
      const addToCartRes = await request.post(`/api/anter_configurator/portal/revisions/${revisionId}/add-to-cart`, { headers: portalCookieHeaders(session) })
      expect(addToCartRes.status()).toBe(403)
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })
})
