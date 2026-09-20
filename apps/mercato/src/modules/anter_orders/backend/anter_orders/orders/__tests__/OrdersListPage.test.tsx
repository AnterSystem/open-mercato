/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import OrdersPage from '../page'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

const mockTranslate = (key: string, fallback?: string) => fallback ?? key

jest.mock('@open-mercato/shared/lib/i18n/context', () => ({ useT: () => mockTranslate, useLocale: () => 'en' }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@open-mercato/ui/backend/Page', () => ({
  Page: ({ children }: any) => <div>{children}</div>,
  PageBody: ({ children }: any) => <div>{children}</div>,
}))
jest.mock('@open-mercato/ui/backend/DataTable', () => ({
  DataTable: ({ data, columns }: any) => (
    <table><tbody>
      {data.map((row: any) => (
        <tr key={row.id}>
          {columns.map((col: any, i: number) => (
            <td key={i}>{typeof col.cell === 'function' ? col.cell({ row: { original: row } }) : null}</td>
          ))}
        </tr>
      ))}
    </tbody></table>
  ),
}))
jest.mock('@open-mercato/ui/backend/utils/apiCall', () => ({ apiCall: jest.fn() }))

const ENTITY = 'd4208c39-d022-43b0-bdd8-9af1a7cb5b40'
const ORDERS = [
  { id: 'o1', order_number: 'ZAM-2026-0001', partner_reference: 'WSS-PO-4401', customer_entity_id: ENTITY,
    source: 'catalog', status: 'delivered', currency_code: 'GBP',
    // The API serialises numerics as STRINGS — the KPI must coerce before summing.
    grand_total_net_amount: '5298.0000', placed_at: '2026-09-20T00:00:00Z' },
  { id: 'o2', order_number: 'ZAM-2026-0002', partner_reference: 'WSS-PO-4402', customer_entity_id: ENTITY,
    source: 'catalog', status: 'shipped', currency_code: 'GBP',
    grand_total_net_amount: '5409.5000', placed_at: '2026-09-20T00:00:00Z' },
]

beforeEach(() => {
  ;(apiCall as jest.Mock).mockReset()
  ;(apiCall as jest.Mock).mockImplementation(async (url: string) => {
    if (url.startsWith('/api/anter_orders/orders')) {
      return { ok: true, result: { items: ORDERS, total: ORDERS.length } }
    }
    if (url.startsWith('/api/customers/companies')) {
      // The customers API returns `display_name`, not `name`.
      return { ok: true, result: { items: [{ id: ENTITY, display_name: 'WSS Europe Ltd' }] } }
    }
    return { ok: false }
  })
})

describe('Anter orders list page', () => {
  it('resolves the partner name from display_name instead of showing the raw UUID', async () => {
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getAllByText('WSS Europe Ltd').length).toBeGreaterThan(0))
    expect(screen.queryByText(ENTITY)).toBeNull()
  })

  it('sums string net amounts into a real currency total rather than NaN', async () => {
    render(<OrdersPage />)
    await waitFor(() => expect(screen.getByText(/10,707\.50/)).toBeInTheDocument())
    expect(screen.queryByText(/NaN/)).toBeNull()
  })
})
