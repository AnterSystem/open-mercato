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

// TC-ANTER-CFG-005: spec Implementation Plan Phase I (steps 32-37) — the
// priced track end to end: placing a configurator-sourced order opens a
// technical-review submission (§3.9/C9), `order.confirm` is blocked while it
// is open (X10), and rejecting it puts the order on `technical_hold` (X8, A-29).

async function pollForSubmission(
  request: import('@playwright/test').APIRequestContext,
  adminToken: string,
  revisionId: string,
): Promise<{ id: string; state: string } | null> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await apiRequest(request, 'GET', '/api/anter_configurator/submissions?pageSize=100', { token: adminToken })
    const body = await readJsonSafe<{ items: Array<{ id: string; revisionId: string; state: string }> }>(res)
    const found = body?.items.find((item) => item.revisionId === revisionId)
    if (found) return found
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return null
}

test.describe('TC-ANTER-CFG-005: anter_configurator submissions and technical review', () => {
  const stamp = Date.now().toString(36)
  let adminToken: string
  let tenantId: string
  let role: CustomerRoleFixture
  let companyId: string
  let barrierProductId: string

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
    tenantId = getTokenContext(adminToken).tenantId
    role = await createCustomerRoleFixture(request, adminToken, { features: ['portal.configurator.use'] })
    companyId = await createCustomerCompanyFixture(request, adminToken, `QA Anter Review Partner ${stamp}`)

    const productRes = await apiRequest(request, 'POST', '/api/catalog/products', {
      token: adminToken,
      data: {
        title: `QA Anter Review Barrier ${stamp}`,
        sku: `ANTER-CFG-REVIEW-${stamp}`,
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
      data: { code: `qa_anter_review_${stamp}`, title: `QA Anter Review Kind ${stamp}`, displayMode: 'excluding-tax', currencyCode: 'PLN' },
    })
    const priceKind = await readJsonSafe<{ id?: string }>(priceKindRes)
    await apiRequest(request, 'POST', '/api/catalog/prices', {
      token: adminToken,
      data: { productId: barrierProductId, priceKindId: priceKind?.id, currencyCode: 'PLN', minQuantity: 1, unitPriceNet: 100, unitPriceGross: 123 },
    })
  })

  test.afterAll(async ({ request }) => {
    await deleteCatalogProductIfExists(request, adminToken, barrierProductId)
    await deleteCustomerCompanyFixture(request, adminToken, companyId)
    await deleteCustomerRoleFixture(request, adminToken, role.id)
  })

  test('a placed configurator order opens a technical-review submission that gates confirm, and rejection puts the order on technical_hold', async ({ request }) => {
    const user = await createCustomerUserFixture(request, adminToken, { roleIds: [role.id], customerEntityId: companyId })
    const session = await portalLogin(request, { email: user.email, password: user.password, tenantId })
    try {
      const projectRes = await request.post('/api/anter_configurator/portal/projects', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { name: `QA Review Project ${stamp}` },
      })
      const project = await readJsonSafe<{ item: { currentRevisionId: string } }>(projectRes)
      const revisionId = project!.item.currentRevisionId

      await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/calibration`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { calibrationPoints: { pointA: [0, 0], pointB: [100, 0], realDistanceM: 1 } },
      })
      await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/elements`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { elements: [{ elementKind: 'run', productId: barrierProductId, geometry: { vertices: [[0, 0], [4200, 0]] }, sortOrder: 0 }] },
      })

      const addToCartRes = await request.post(`/api/anter_configurator/portal/revisions/${revisionId}/add-to-cart`, { headers: portalCookieHeaders(session) })
      expect(addToCartRes.status()).toBe(200)

      await request.put('/api/anter_portal/cart', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { deliveryMode: 'self_collection' },
      })
      const checkoutRes = await request.post('/api/anter_portal/checkout', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: {},
      })
      expect(checkoutRes.status(), 'checkout should succeed for a fully priced configurator cart').toBe(201)
      const order = await readJsonSafe<{ item: { orderId: string } }>(checkoutRes)
      const orderId = order!.item.orderId

      const submission = await pollForSubmission(request, adminToken, revisionId)
      expect(submission, 'placing the order should open a priced-track submission for its revision').toBeTruthy()
      expect(submission!.state).toBe('technical_review')

      const confirmBlockedRes = await apiRequest(request, 'POST', `/api/anter_orders/orders/${orderId}/confirm`, { token: adminToken, data: {} })
      expect(confirmBlockedRes.status(), 'confirm must be blocked until the revision is technically accepted (X10)').toBe(422)
      const confirmBlockedBody = await readJsonSafe<{ error: string }>(confirmBlockedRes)
      expect(confirmBlockedBody?.error).toBe('technical_acceptance_required')

      const rejectRes = await apiRequest(request, 'POST', `/api/anter_configurator/submissions/${submission!.id}/reject`, {
        token: adminToken,
        data: { reason: 'QA: unsafe anchor spacing' },
      })
      expect(rejectRes.status()).toBe(200)

      const orderRes = await apiRequest(request, 'GET', `/api/anter_orders/orders?id=${orderId}`, { token: adminToken })
      const orderBody = await readJsonSafe<{ items: Array<{ status: string }> }>(orderRes)
      expect(orderBody?.items?.[0]?.status, 'a rejected priced submission puts its order on technical_hold (X8)').toBe('technical_hold')
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })
})
