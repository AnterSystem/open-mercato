"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { ShoppingBag, List, LayoutGrid } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DataTable } from '@open-mercato/ui'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { usePortalContext } from '@open-mercato/ui/portal/PortalContext'
import { PortalPageHeader } from '@open-mercato/ui/portal/components/PortalPageHeader'
import { PortalEmptyState } from '@open-mercato/ui/portal/components/PortalEmptyState'

type Props = { params: { orgSlug: string } }

type Availability =
  | { status: 'in_stock' }
  | { status: 'expected'; expectedRestockAt: string | null }
  | { status: 'quote_only' }
  | { status: 'outside_price_list' }

type CatalogRow = {
  productId: string
  title: string
  sku: string | null
  currencyCode: string
  listUnitPriceNet: number | null
  partnerUnitPriceNet: number | null
  discountRate: number | null
  availability: Availability
  priceVisible: boolean
  parameters: string | null
}

type CatalogResponse = { items: CatalogRow[]; total: number; page: number; pageSize: number }
type CategoriesResponse = { items: Array<{ id: string; name: string }> }

const ALL_CATEGORIES = '__all__'

function formatMoney(value: number | null, currencyCode: string): string {
  if (value == null) return '—'
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(value)
}

function AvailabilityBadge({ availability, t }: { availability: Availability; t: (key: string, fallback?: string) => string }) {
  if (availability.status === 'in_stock') {
    return <StatusBadge variant="success">{t('anter_portal.catalog.availability.inStock', 'In stock')}</StatusBadge>
  }
  if (availability.status === 'expected') {
    return <StatusBadge variant="info">{t('anter_portal.catalog.availability.expected', 'On order')}</StatusBadge>
  }
  if (availability.status === 'outside_price_list') {
    return <StatusBadge variant="warning">{t('anter_portal.catalog.availability.outsidePriceList', 'Outside your price list')}</StatusBadge>
  }
  return <StatusBadge variant="neutral">{t('anter_portal.catalog.quoteOnly', 'Quote only')}</StatusBadge>
}

export default function AnterPortalCatalogPage({ params }: Props) {
  const t = useT()
  const router = useRouter()
  const { auth } = usePortalContext()
  const { user, loading } = auth

  const [view, setView] = React.useState<'list' | 'tile'>('list')
  const [categories, setCategories] = React.useState<Array<{ id: string; name: string }>>([])
  const [categoryId, setCategoryId] = React.useState<string>(ALL_CATEGORIES)
  const [rows, setRows] = React.useState<CatalogRow[]>([])
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(24)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const addToCart = useGuardedMutation<Record<string, unknown>>({
    contextId: 'anter_portal.catalog.addToCart',
    blockedMessage: t('anter_portal.catalog.addBlocked', 'Adding to cart is blocked'),
  })

  React.useEffect(() => {
    if (!loading && !user) router.replace(`/${params.orgSlug}/portal/login`)
  }, [loading, user, router, params.orgSlug])

  React.useEffect(() => {
    if (!user) return
    apiCall<CategoriesResponse>('/api/anter_portal/categories').then((res) => {
      if (res.ok && res.result) setCategories(res.result.items)
    })
  }, [user])

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    setIsLoading(true)
    setError(null)
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (categoryId !== ALL_CATEGORIES) query.set('categoryId', categoryId)
    apiCall<CatalogResponse>(`/api/anter_portal/catalog?${query.toString()}`)
      .then((res) => {
        if (cancelled) return
        if (!res.ok || !res.result) {
          setError(t('anter_portal.catalog.loadError', 'Failed to load the catalogue'))
          setRows([])
          setTotal(0)
          return
        }
        setRows(res.result.items)
        setTotal(res.result.total)
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('anter_portal.catalog.loadError', 'Failed to load the catalogue'))
          setRows([])
          setTotal(0)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, page, pageSize, categoryId, t])

  const handleAddToCart = React.useCallback(async (row: CatalogRow) => {
    const result = await addToCart.runMutation({
      operation: () => apiCall<{ item: unknown }>('/api/anter_portal/cart/lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ productId: row.productId, quantity: 1 }),
      }),
      context: {
        moduleId: 'anter_portal',
        entityId: 'anter_portal.cart_line',
        operation: 'add_to_cart',
        resourceKind: 'anter_portal.cart',
        formId: 'anter_portal.catalog.addToCart',
        retryLastMutation: addToCart.retryLastMutation,
      },
      mutationPayload: { productId: row.productId, quantity: 1 },
    })
    if (!result.ok || !result.result) {
      flash(t('anter_portal.catalog.addError', 'Could not add this item to the cart'), 'error')
      return
    }
    flash(t('anter_portal.catalog.addSuccess', 'Added to cart'), 'success')
  }, [addToCart, t])

  // Configurator spec X5: a `hidden` account_type never sees a price
  // anywhere in the catalogue — this is a property of the caller, uniform
  // across every row on the page, so the whole column set switches once.
  const priceVisible = rows.length === 0 || rows.every((row) => row.priceVisible)

  const columns = React.useMemo<ColumnDef<CatalogRow>[]>(() => [
    {
      id: 'title',
      header: t('anter_portal.catalog.column.product', 'Product'),
      cell: ({ row }) => (
        <Link href={`/${params.orgSlug}/portal/catalog/${row.original.productId}`} className="block min-w-0">
          <span className="block truncate font-medium text-foreground">{row.original.title}</span>
          {row.original.sku ? <span className="block text-overline text-muted-foreground">{row.original.sku}</span> : null}
        </Link>
      ),
      meta: { truncate: true, maxWidth: 320 },
    },
    ...(priceVisible ? [
      {
        id: 'listPrice',
        header: t('anter_portal.catalog.column.listPrice', 'List price'),
        cell: ({ row }: { row: { original: CatalogRow } }) => formatMoney(row.original.listUnitPriceNet, row.original.currencyCode),
        meta: { maxWidth: 140 },
      },
      {
        id: 'partnerPrice',
        header: t('anter_portal.catalog.column.yourPrice', 'Your price'),
        cell: ({ row }: { row: { original: CatalogRow } }) => (
          <span className="font-medium text-foreground">{formatMoney(row.original.partnerUnitPriceNet, row.original.currencyCode)}</span>
        ),
        meta: { maxWidth: 140 },
      },
    ] : [
      {
        id: 'parameters',
        header: t('anter_portal.catalog.column.parameters', 'Parameters'),
        cell: ({ row }: { row: { original: CatalogRow } }) => row.original.parameters ?? '—',
        meta: { maxWidth: 200 },
      },
    ]),
    {
      id: 'availability',
      header: t('anter_portal.catalog.column.availability', 'Availability'),
      cell: ({ row }) => <AvailabilityBadge availability={row.original.availability} t={t} />,
      meta: { maxWidth: 160 },
    },
    {
      id: 'action',
      header: '',
      meta: { maxWidth: 160 },
      cell: ({ row }) => (
        row.original.priceVisible ? (
          <Button
            size="sm"
            disabled={row.original.availability.status !== 'in_stock' && row.original.availability.status !== 'expected'}
            onClick={() => handleAddToCart(row.original)}
          >
            {t('anter_portal.catalog.addToCart', 'Add to cart')}
          </Button>
        ) : (
          <Button size="sm" variant="outline" asChild>
            <Link href={`/${params.orgSlug}/portal/configurator`}>{t('anter_portal.catalog.requestQuote', 'Zapytaj o wycenę')}</Link>
          </Button>
        )
      ),
    },
  ], [t, params.orgSlug, handleAddToCart, priceVisible])

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Spinner /></div>
  }
  if (!user) return null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 pt-2">
      <PortalPageHeader title={t('anter_portal.catalog.title', 'Catalogue')} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={categoryId} onValueChange={(value) => { setCategoryId(value); setPage(1) }}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t('anter_portal.catalog.allCategories', 'All categories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES}>{t('anter_portal.catalog.allCategories', 'All categories')}</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <SegmentedControl value={view} onValueChange={(value) => setView(value === 'tile' ? 'tile' : 'list')}>
          <SegmentedControlItem value="list" aria-label={t('anter_portal.catalog.view.list', 'List view')}>
            <List className="size-4" />
          </SegmentedControlItem>
          <SegmentedControlItem value="tile" aria-label={t('anter_portal.catalog.view.tile', 'Tile view')}>
            <LayoutGrid className="size-4" />
          </SegmentedControlItem>
        </SegmentedControl>
      </div>

      {error ? <ErrorMessage label={error} /> : null}

      {!isLoading && rows.length === 0 ? (
        <PortalEmptyState
          icon={<ShoppingBag className="size-5" />}
          title={t('anter_portal.catalog.empty.title', 'No products found')}
          description={t('anter_portal.catalog.empty.description', 'Try a different category.')}
        />
      ) : view === 'list' ? (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <DataTable<CatalogRow>
            embedded
            columns={columns}
            data={rows}
            isLoading={isLoading}
            pagination={{
              page,
              pageSize,
              total,
              totalPages: Math.max(1, Math.ceil(total / pageSize)),
              onPageChange: setPage,
              onPageSizeChange: () => {},
            }}
          />
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <div key={row.productId} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex h-32 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <ShoppingBag className="size-8" aria-hidden="true" />
              </div>
              <Link href={`/${params.orgSlug}/portal/catalog/${row.productId}`} className="min-w-0">
                <span className="block truncate font-medium text-foreground">{row.title}</span>
                {row.sku ? <span className="block text-overline text-muted-foreground">{row.sku}</span> : null}
              </Link>
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">
                  {row.priceVisible ? formatMoney(row.partnerUnitPriceNet, row.currencyCode) : (row.parameters ?? '—')}
                </span>
                <AvailabilityBadge availability={row.availability} t={t} />
              </div>
              {row.priceVisible ? (
                <Button
                  size="sm"
                  disabled={row.availability.status !== 'in_stock' && row.availability.status !== 'expected'}
                  onClick={() => handleAddToCart(row)}
                >
                  {t('anter_portal.catalog.addToCart', 'Add to cart')}
                </Button>
              ) : (
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/${params.orgSlug}/portal/configurator`}>{t('anter_portal.catalog.requestQuote', 'Zapytaj o wycenę')}</Link>
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
