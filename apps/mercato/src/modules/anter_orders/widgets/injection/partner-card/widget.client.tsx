"use client"

import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { FormField } from '@open-mercato/ui/primitives/form-field'
import { flash } from '@open-mercato/ui/backend/FlashMessages'

type PartnerTerms = {
  id: string
  customerEntityId: string
  defaultDiscountRate: number
  priceListCode: string | null
  isBlocked: boolean
}

type PartnerStats = {
  lastOrderAt: string | null
  rollingTurnoverNetAmount: number
  orderCount: number
}

type PartnerCardResponse = { item: { terms: PartnerTerms | null; stats: PartnerStats } }

interface PartnerCardProps {
  context?: { entityId?: string; recordId?: string }
}

/**
 * s16 (order stats) + s17 (terms editing) in one card, per spec §3.8: "The
 * partner card figures... computed on read by anterPartnerStatsService and
 * rendered by a widget injected into the CRM company detail page at spot
 * crud-form:customers.company — the same mechanism customer_accounts already
 * uses for its company-users widget."
 */
export default function PartnerCardWidget({ context }: PartnerCardProps) {
  const t = useT()
  const customerEntityId = context?.recordId
  const queryClient = useQueryClient()
  const [discountRate, setDiscountRate] = React.useState('')
  const [isBlocked, setIsBlocked] = React.useState(false)
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

  React.useEffect(() => {
    if (!data) return
    setDiscountRate(data.terms ? String(data.terms.defaultDiscountRate) : '0')
    setIsBlocked(data.terms?.isBlocked ?? false)
  }, [data])

  const handleSave = React.useCallback(async () => {
    if (!customerEntityId) return
    setSaving(true)
    const body = { defaultDiscountRate: Number(discountRate) || 0, isBlocked }
    const result = data?.terms
      ? await apiCall('/api/anter_orders/partner-terms', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: data.terms.id, ...body }),
        })
      : await apiCall('/api/anter_orders/partner-terms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ customerEntityId, ...body }),
        })
    setSaving(false)
    if (!result.ok) {
      flash(t('anter_orders.widgets.partnerCard.saveError', 'Could not save partner terms'), 'error')
      return
    }
    flash(t('anter_orders.widgets.partnerCard.saveSuccess', 'Saved'), 'success')
    void queryClient.invalidateQueries({ queryKey: ['anter-partner-card', customerEntityId] })
  }, [customerEntityId, discountRate, isBlocked, data, t, queryClient])

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

      <div className="flex flex-col gap-2 border-t pt-3">
        <FormField label={t('anter_orders.fields.defaultDiscountRate', 'Default discount rate')}>
          <Input type="number" min={0} max={1} step="0.01" value={discountRate} onChange={(event) => setDiscountRate(event.target.value)} className="w-32" />
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
