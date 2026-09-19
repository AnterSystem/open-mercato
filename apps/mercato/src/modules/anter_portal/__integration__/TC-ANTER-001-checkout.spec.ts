import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { getTokenContext, readJsonSafe } from '@open-mercato/core/helpers/integration/generalFixtures'
import { createProductFixture, deleteCatalogProductIfExists } from '@open-mercato/core/helpers/integration/catalogFixtures'
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

// TC-ANTER-001: spec Implementation Plan step 17 (Phase A) — POST
// /api/anter_portal/checkout, matching the assertions listed in the spec's
// own §Test coverage table for this endpoint: happy path with a partner
// reference (reference frozen onto the order), 403 on a blocked partner
// with NO reason in the body, and 422 on an empty cart.

test.describe('TC-ANTER-001: anter_portal checkout', () => {
  const stamp = Date.now().toString(36)
  let adminToken: string
  let tenantId: string
  let role: CustomerRoleFixture
  let companyId: string
  let productId: string

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
    tenantId = getTokenContext(adminToken).tenantId

    role = await createCustomerRoleFixture(request, adminToken, {
      features: ['portal.catalog.view', 'portal.orders.view', 'portal.orders.create'],
    })
    companyId = await createCustomerCompanyFixture(request, adminToken, `QA Anter Partner ${stamp}`)

    productId = await createProductFixture(request, adminToken, {
      title: `QA Anter Product ${stamp}`,
      sku: `QA-ANTER-${stamp}`,
    })
    const priceKindRes = await apiRequest(request, 'POST', '/api/catalog/price-kinds', {
      token: adminToken,
      data: { code: `qa_anter_${stamp}`, title: `QA Anter Kind ${stamp}`, displayMode: 'excluding-tax', currencyCode: 'PLN' },
    })
    const priceKind = await readJsonSafe<{ id?: string }>(priceKindRes)
    await apiRequest(request, 'POST', '/api/catalog/prices', {
      token: adminToken,
      data: { productId, priceKindId: priceKind?.id, currencyCode: 'PLN', minQuantity: 1, unitPriceNet: 100, unitPriceGross: 123 },
    })
  })

  test.afterAll(async ({ request }) => {
    await deleteCatalogProductIfExists(request, adminToken, productId)
    await deleteCustomerCompanyFixture(request, adminToken, companyId)
    await deleteCustomerRoleFixture(request, adminToken, role.id)
  })

  async function createPortalSession(request: import('@playwright/test').APIRequestContext) {
    const user = await createCustomerUserFixture(request, adminToken, { roleIds: [role.id], customerEntityId: companyId })
    const session = await portalLogin(request, { email: user.email, password: user.password, tenantId })
    return { user, session }
  }

  async function addProductToCart(request: import('@playwright/test').APIRequestContext, session: Awaited<ReturnType<typeof portalLogin>>) {
    const res = await request.post('/api/anter_portal/cart/lines', {
      headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
      data: { productId, quantity: 2 },
    })
    expect(res.status(), 'POST /cart/lines should add the product').toBe(201)
    await request.put('/api/anter_portal/cart', {
      headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
      data: { deliveryMode: 'self_collection' },
    })
  }

  test('places an order with a partner reference, frozen onto the order', async ({ request }) => {
    const { user, session } = await createPortalSession(request)
    try {
      await addProductToCart(request, session)

      const checkoutRes = await request.post('/api/anter_portal/checkout', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { partnerReference: `QA-REF-${stamp}` },
      })
      expect(checkoutRes.status(), 'checkout should succeed').toBe(201)
      const body = await readJsonSafe<{ item: { orderId: string; orderNumber: string } }>(checkoutRes)
      expect(body?.item?.orderId).toBeTruthy()
      expect(body?.item?.orderNumber).toBeTruthy()

      const orderRes = await request.get(`/api/anter_portal/orders/${body!.item.orderId}`, {
        headers: portalCookieHeaders(session),
      })
      expect(orderRes.status()).toBe(200)
      const order = await readJsonSafe<{ item: { partnerReference: string | null } }>(orderRes)
      expect(order?.item?.partnerReference).toBe(`QA-REF-${stamp}`)
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })

  test('rejects checkout for a blocked partner with no reason in the body', async ({ request }) => {
    const { user, session } = await createPortalSession(request)
    let termsId: string | null = null
    try {
      await addProductToCart(request, session)

      const termsRes = await apiRequest(request, 'POST', '/api/anter_orders/partner-terms', {
        token: adminToken,
        data: { customerEntityId: companyId, defaultDiscountRate: 0, isBlocked: true },
      })
      const terms = await readJsonSafe<{ id?: string }>(termsRes)
      termsId = terms?.id ?? null

      const checkoutRes = await request.post('/api/anter_portal/checkout', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: {},
      })
      expect(checkoutRes.status()).toBe(403)
      const body = await readJsonSafe<Record<string, unknown>>(checkoutRes)
      expect(body).toEqual({ error: 'ordering_blocked' })
    } finally {
      if (termsId) {
        await apiRequest(request, 'DELETE', '/api/anter_orders/partner-terms', { token: adminToken, data: { id: termsId } })
      }
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })

  test('rejects checkout with an empty cart', async ({ request }) => {
    const { user, session } = await createPortalSession(request)
    try {
      const checkoutRes = await request.post('/api/anter_portal/checkout', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: {},
      })
      expect(checkoutRes.status()).toBe(422)
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
    }
  })
})
