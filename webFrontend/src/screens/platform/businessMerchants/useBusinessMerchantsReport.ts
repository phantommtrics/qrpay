import { useCallback, useEffect, useState } from 'react'

import {
  fetchPlatformMerchantCategoryJournal,
  type PlatformMerchantCategoryJournal,
  type PlatformMerchantJournalSection,
} from '../../../services/catalogReportsApi'
import { ApiError } from '../../../services/subscriptionApi'
import { useBusinessMerchantsReportFilters } from './useBusinessMerchantsReportFilters'

export function useBusinessMerchantsReport(section: PlatformMerchantJournalSection) {
  const filters = useBusinessMerchantsReportFilters()
  const { canView, from, to, merchantId, mergeMerchants } = filters

  const [report, setReport] = useState<PlatformMerchantCategoryJournal | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReport = useCallback(() => {
    if (!canView) return
    setLoading(true)
    setError(null)
    void fetchPlatformMerchantCategoryJournal({
      from,
      to,
      businessId: merchantId || undefined,
      section,
    })
      .then((data) => {
        setReport(data)
        mergeMerchants(data.merchants)
      })
      .catch((e) => {
        setReport(null)
        setError(e instanceof ApiError ? e.message : 'Could not load report.')
      })
      .finally(() => setLoading(false))
  }, [canView, from, to, merchantId, section, mergeMerchants])

  useEffect(() => {
    if (!canView) return
    loadReport()
  }, [canView, loadReport])

  return {
    ...filters,
    report,
    loading,
    error,
    loadReport,
  }
}
