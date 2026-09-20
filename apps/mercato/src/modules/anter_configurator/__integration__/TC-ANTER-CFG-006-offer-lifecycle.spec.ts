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

// TC-ANTER-CFG-006: spec Implementation Plan Phase J (steps 42-45, 49-50) —
// the unpriced track's offer lifecycle end to end: build a draft offer from
// a revision, issue it, and accept it into an order, asserting §3.11's "one
// arithmetic" equality — the revision's own BOM total, the issued offer's
// grand total, and the resulting order's grand total must be identical to
// the stored scale, because all three go through `salesCalculationService`
// on the same line snapshots.

test.describe('TC-ANTER-CFG-006: anter_configurator offer lifecycle and total equality', () => {
  const stamp = Date.now().toString(36)
  let adminToken: string
  let tenantId: string
  let role: CustomerRoleFixture
  let companyId: string
  let barrierProductId: string

  test.beforeAll(async ({ request }) => {
    adminToken = await getAuthToken(request, 'admin')
    tenantId = getTokenContext(adminToken).tenantId
    role = await createCustomerRoleFixture(request, adminToken, { features: ['portal.configurator.use', 'portal.offers.view', 'portal.offers.accept'] })
    companyId = await createCustomerCompanyFixture(request, adminToken, `QA Anter Offer Partner ${stamp}`)

    const productRes = await apiRequest(request, 'POST', '/api/catalog/products', {
      token: adminToken,
      data: {
        title: `QA Anter Offer Barrier ${stamp}`,
        sku: `ANTER-CFG-OFFER-${stamp}`,
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
      data: { code: `qa_anter_offer_${stamp}`, title: `QA Anter Offer Kind ${stamp}`, displayMode: 'excluding-tax', currencyCode: 'PLN' },
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

  test('builds, issues and accepts an offer with equal totals across revision, offer and order', async ({ request }) => {
    // Unpriced track: `account_type: 'hidden'` sends the configuration down
    // the technical-review → valuation → offer path (§3.9), not the cart.
    const termsRes = await apiRequest(request, 'POST', '/api/anter_orders/partner-terms', {
      token: adminToken,
      data: { customerEntityId: companyId, defaultDiscountRate: 0, accountType: 'hidden' },
    })
    const terms = await readJsonSafe<{ id?: string }>(termsRes)

    const user = await createCustomerUserFixture(request, adminToken, { roleIds: [role.id], customerEntityId: companyId })
    const session = await portalLogin(request, { email: user.email, password: user.password, tenantId })
    let submissionId: string | null = null
    let offerId: string | null = null

    try {
      const projectRes = await request.post('/api/anter_configurator/portal/projects', {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { name: `QA Offer Project ${stamp}` },
      })
      const project = await readJsonSafe<{ item: { currentRevisionId: string } }>(projectRes)
      const revisionId = project!.item.currentRevisionId

      await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/calibration`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { calibrationPoints: { pointA: [0, 0], pointB: [100, 0], realDistanceM: 1 } },
      })
      const elementsRes = await request.put(`/api/anter_configurator/portal/revisions/${revisionId}/elements`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { elements: [{ elementKind: 'run', productId: barrierProductId, geometry: { vertices: [[0, 0], [4200, 0]] }, sortOrder: 0 }] },
      })
      expect(elementsRes.status()).toBe(200)

      const revisionRes = await apiRequest(request, 'GET', `/api/anter_configurator/revisions/${revisionId}/bom`, { token: adminToken })
      const revisionBom = await readJsonSafe<{ item: { bomTotalNetAmount: number } }>(revisionRes)
      const panelTotal = revisionBom!.item.bomTotalNetAmount

      const quoteRes = await request.post(`/api/anter_configurator/portal/revisions/${revisionId}/quote-request`, { headers: portalCookieHeaders(session) })
      expect(quoteRes.status()).toBe(200)
      const quote = await readJsonSafe<{ item: { submissionId: string } }>(quoteRes)
      submissionId = quote!.item.submissionId

      const acceptRes = await apiRequest(request, 'POST', `/api/anter_configurator/submissions/${submissionId}/accept-technical`, { token: adminToken, data: {} })
      expect(acceptRes.status(), 'technical acceptance should move an unpriced submission to valuation').toBe(200)

      const buildRes = await apiRequest(request, 'POST', '/api/anter_configurator/offers', {
        token: adminToken,
        data: { revisionId, submissionId },
      })
      expect(buildRes.status()).toBe(201)
      const built = await readJsonSafe<{ item: { offerId: string; grandTotalNetAmount: number } }>(buildRes)
      offerId = built!.item.offerId
      expect(built!.item.grandTotalNetAmount).toBe(panelTotal)

      const issueRes = await apiRequest(request, 'POST', `/api/anter_configurator/offers/${offerId}/issue`, { token: adminToken, data: {} })
      expect(issueRes.status()).toBe(200)
      const issued = await readJsonSafe<{ item: { offerNumber: string } }>(issueRes)
      expect(issued?.item.offerNumber).toMatch(/^OF-\d{4}-\d{4}$/)

      const acceptOfferRes = await request.post(`/api/anter_configurator/portal/offers/${offerId}/accept`, {
        headers: portalCookieHeaders(session, { 'Content-Type': 'application/json' }),
        data: { deliveryMode: 'self_collection' },
      })
      expect(acceptOfferRes.status()).toBe(200)
      const accepted = await readJsonSafe<{ item: { orderId: string } }>(acceptOfferRes)

      const offerDetailRes = await apiRequest(request, 'GET', `/api/anter_configurator/offers/${offerId}`, { token: adminToken })
      const offerDetail = await readJsonSafe<{ item: { grandTotalNetAmount: number; status: string } }>(offerDetailRes)
      expect(offerDetail?.item.status).toBe('accepted')

      const orderRes = await apiRequest(request, 'GET', `/api/anter_orders/orders?id=${accepted!.item.orderId}`, { token: adminToken })
      const orderBody = await readJsonSafe<{ items: Array<{ grand_total_net_amount: string; source: string }> }>(orderRes)
      const order = orderBody!.items[0]
      expect(order.source).toBe('crm_offer')
      expect(Number(order.grand_total_net_amount)).toBe(panelTotal)
      expect(offerDetail?.item.grandTotalNetAmount).toBe(panelTotal)
    } finally {
      await deleteCustomerUserFixture(request, adminToken, user.id)
      if (terms?.id) {
        await apiRequest(request, 'DELETE', '/api/anter_orders/partner-terms', { token: adminToken, data: { id: terms.id } })
      }
    }
  })
})
