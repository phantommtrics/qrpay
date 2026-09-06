import { useCallback, useEffect, useMemo, useState } from 'react'

import { useAuth } from '../../../features/auth/AuthContext'
import { type PlatformMerchantOption } from '../../../services/catalogReportsApi'
import { fetchPlatformBusinessesList } from '../../../services/subscriptionApi'
import { isPlatformOperator } from '../../../utils/platformOperator'
import { type DatePreset, presetRange } from './reportDatePresets'

export function useBusinessMerchantsReportFilters() {
  const { user, canAccess } = useAuth()
  const canView = isPlatformOperator(user) && canAccess('platform.business_merchants.view')
  const canExport = canAccess('platform.business_merchants.export')

  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [from, setFrom] = useState(() => presetRange('today', new Date())!.from)
  const [to, setTo] = useState(() => presetRange('today', new Date())!.to)
  const [merchantId, setMerchantId] = useState('')
  const [merchantOptions, setMerchantOptions] = useState<PlatformMerchantOption[]>([])

  useEffect(() => {
    if (datePreset === 'custom') return
    const r = presetRange(datePreset, new Date())
    if (r) {
      setFrom(r.from)
      setTo(r.to)
    }
  }, [datePreset])

  useEffect(() => {
    if (!canView) return
    void fetchPlatformBusinessesList({ page: 1, pageSize: 500 })
      .then((payload) => {
        setMerchantOptions(
          payload.data.map((b) => ({ id: b.id, name: b.name })).sort((a, b) => a.name.localeCompare(b.name)),
        )
      })
      .catch(() => {
        /* Report responses also include merchants. */
      })
  }, [canView])

  const merchantSelectOptions = useMemo(
    () => [
      { value: '', label: 'All merchants' },
      ...merchantOptions.map((m) => ({ value: m.id, label: m.name })),
    ],
    [merchantOptions],
  )

  const periodLabel = useMemo(() => `${from} → ${to}`, [from, to])

  const mergeMerchants = useCallback((next: PlatformMerchantOption[]) => {
    if (next.length === 0) return
    setMerchantOptions((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]))
      for (const m of next) {
        byId.set(m.id, m)
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
    })
  }, [])

  return {
    canView,
    canExport,
    datePreset,
    setDatePreset,
    from,
    setFrom,
    to,
    setTo,
    merchantId,
    setMerchantId,
    merchantSelectOptions,
    periodLabel,
    mergeMerchants,
  }
}
