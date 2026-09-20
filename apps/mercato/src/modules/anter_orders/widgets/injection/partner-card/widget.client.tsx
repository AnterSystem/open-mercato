"use client"

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type PartnerTerms = {
  id: string
  customerEntityId: string
  defaultDiscountRate: number
  priceListCode: string | null
  isBlocked: boolean
  accountType: 'full' | 'hidden' | 'preview'
  accountOwnerUserId: string | null
}

type PartnerStats = {
  lastOrderAt: string | null
  rollingTurnoverNetAmount: number
  orderCount: number
}

type PartnerCardResponse = { item: { terms: PartnerTerms | null; stats: PartnerStats } }
type UserOption = { id: string; email: string; name: string | null }
type CategoryOption = { id: string; name: string }

interface PartnerCardProps {
  context?: { entityId?: string; recordId?: string }
}

const ACCOUNT_TYPES: PartnerTerms['accountType'][] = ['full', 'hidden', 'preview']

/**
 * s16 (order stats) + s17 (terms editing, extended by configurator spec X4:
 * account type + price-list scope) in one card, injected into the CRM
 * company detail page at spot `crud-form:customers.company`.
 */
export default function PartnerCardWidget({ context }: PartnerCardProps) {
  const t = useT()
  const customerEntityId = context?.recordId
  const queryClient = useQueryClient()
  const [discountRate, setDiscountRate] = React.useState('')
  const [isBlocked, setIsBlocked] = React.useState(false)
  const [accountType, setAccountType] = React.useState<PartnerTerms['accountType']>('full')
  const [accountOwnerUserId, setAccountOwnerUserId] = React.useState<string>('')
  const [excludedCategoryIds, setExcludedCategoryIds] = React.useState<Set<string>>(new Set())
  const [saving, setSaving] = React.useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['anter-partner-card', customerEntityId],
    queryFn: async (): Promise<PartnerCardResponse['item'] | null> => {
      if (!customerEntityId) return null
      const result = await apiCall<PartnerCardResponse>(`/api/anter_orders/partner-card?customerEntityId=${customerEntityId}`)
      if (!result.ok || !result.result) return null
      return result.result.item
    },
    enabled: !!customerEntityId,
  })

  const { data: users } = useQuery({
    queryKey: ['anter-partner-card-users'],
    queryFn: async (): Promise<UserOption[]> => {
      const result = await apiCall<{ items: UserOption[] }>('/api/auth/users?pageSize=100')
      return result.ok && result.result ? result.result.items : []
    },
  })

  const { data: categories } = useQuery({
    queryKey: ['anter-partner-card-categories'],
    queryFn: async (): Promise<CategoryOption[]> => {
      const result = await apiCall<{ items: CategoryOption[] }>('/api/catalog/categories?pageSize=100')
      return result.ok && result.result ? result.result.items : []
    },
  })

  const { data: scopeData } = useQuery({
    queryKey: ['anter-partner-card-scope', data?.terms?.id],
    queryFn: async (): Promise<string[]> => {
      if (!data?.terms?.id) return []
      const result = await apiCall<{ item: { excludedCategoryIds: string[] } }>(`/api/anter_orders/partner-price-list-scope?partnerTermsId=${data.terms.id}`)
      return result.ok && result.result ? result.result.item.excludedCategoryIds : []
    },
    enabled: !!data?.terms?.id,
  })

  React.useEffect(() => {
    if (!data) return
    setDiscountRate(data.terms ? String(data.terms.defaultDiscountRate) : '0')
    setIsBlocked(data.terms?.isBlocked ?? false)
    setAccountType(data.terms?.accountType ?? 'full')
    setAccountOwnerUserId(data.terms?.accountOwnerUserId ?? '')
  }, [data])

  React.useEffect(() => {
    setExcludedCategoryIds(new Set(scopeData ?? []))
  }, [scopeData])

  const handleSave = React.useCallback(async () => {
    if (!customerEntityId) return
    setSaving(true)
    const body = {
      defaultDiscountRate: Number(discountRate) || 0,
      isBlocked,
      accountType,
      accountOwnerUserId: accountOwnerUserId || null,
    }
    const result = data?.terms
      ? await apiCall<{ ok: true }>('/api/anter_orders/partner-terms', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: data.terms.id, ...body }),
        })
      : await apiCall<{ id: string }>('/api/anter_orders/partner-terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ customerEntityId, ...body }),
        })
    if (!result.ok) {
      setSaving(false)
      flash(t('anter_orders.widgets.partnerCard.saveError', 'Could not save partner terms'), 'error')
      return
    }

    const partnerTermsId = data?.terms?.id ?? (result.result as { id?: string } | undefined)?.id
    if (partnerTermsId) {
      await apiCall('/api/anter_orders/partner-price-list-scope', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ partnerTermsId, excludedCategoryIds: [...excludedCategoryIds] }),
      })
    }

    setSaving(false)
    flash(t('anter_orders.widgets.partnerCard.saveSuccess', 'Saved'), 'success')
    void queryClient.invalidateQueries({ queryKey: ['anter-partner-card', customerEntityId] })
    void queryClient.invalidateQueries({ queryKey: ['anter-partner-card-scope', partnerTermsId] })
  }, [customerEntityId, discountRate, isBlocked, accountType, accountOwnerUserId, excludedCategoryIds, data, t, queryClient])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t('common.loading', 'Loading...')}</div>
  }

  const stats = data?.stats

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-sm font-medium">{t('anter_orders.widgets.partnerCard.title', 'Anter partner')}</div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <div className="text-overline text-muted-foreground">{t('anter_orders.widgets.partnerCard.lastOrder', 'Last order')}</div>
          <div>{stats?.lastOrderAt ? new Date(stats.lastOrderAt).toLocaleDateString() : '—'}</div>
        </div>
        <div>
          <div className="text-overline text-muted-foreground">{t('anter_orders.widgets.partnerCard.turnover', 'Turnover (12mo)')}</div>
          <div>{stats?.rollingTurnoverNetAmount?.toFixed(2) ?? '0.00'}</div>
        </div>
        <div>
          <div className="text-overline text-muted-foreground">{t('anter_orders.widgets.partnerCard.orderCount', 'Orders')}</div>
          <div>{stats?.orderCount ?? 0}</div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t pt-3">
        <FormField label={t('anter_orders.fields.defaultDiscountRate', 'Default discount rate')}>
          <Input type="number" min={0} max={1} step="0.01" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} className="w-32" />
        </FormField>

        <FormField label={t('anter_orders.fields.accountType', 'Configurator account type')}>
          <Select value={accountType} onValueChange={(value) => setAccountType(value as PartnerTerms['accountType'])}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`anter_orders.fields.accountType.${value}`, value)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('anter_orders.fields.accountOwner', 'Account owner')}>
          <Select value={accountOwnerUserId || undefined} onValueChange={(value) => setAccountOwnerUserId(value)}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder={t('anter_orders.fields.accountOwnerPlaceholder', 'No owner assigned')} />
            </SelectTrigger>
            <SelectContent>
              {(users ?? []).map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.name ?? user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('anter_orders.fields.priceListScope', 'Excluded from price list')}>
          <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2">
            {(categories ?? []).map((category) => (
              <label key={category.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={excludedCategoryIds.has(category.id)}
                  onCheckedChange={(checked) => {
                    setExcludedCategoryIds((prev) => {
                      const next = new Set(prev)
                      if (checked === true) next.add(category.id)
                      else next.delete(category.id)
                      return next
                    })
                  }}
                />
                {category.name}
              </label>
            ))}
          </div>
        </FormField>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isBlocked} onCheckedChange={(checked) => setIsBlocked(checked === true)} />
          {t('anter_orders.widgets.partnerCard.blocked', 'Ordering blocked')}
        </label>
        <div>
          <Button size="sm" onClick={handleSave} disabled={saving || !customerEntityId}>
            {t('common.save', 'Save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
