import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { CenteredModal } from '../ui/CenteredModal'
import { ModalOverlay } from '../ui/ModalOverlay'
import { APP_PATHS } from '../../config/navigation'
import { fetchAccountingSummary, type AccountingAccountRow } from '../../services/accountingApi'
import {
  executeBillBulkPost,
  previewBillBulkPost,
  type BillBulkPostGatewayRow,
  type BillBulkPostPreviewItem,
  type BillBulkPostResult,
  type BillBulkPostSummary,
} from '../../services/salesDocumentsApi'
import { ApiError } from '../../services/subscriptionApi'
import { checkoutWalletBrandImageSrc } from '../../utils/checkoutWalletBrandImage'
import { formatMoney } from '../../utils/formatMoney'

type Step = 'gateway' | 'settlement' | 'preview' | 'results'

type Props = {
  open: boolean
  businessId: string
  billIds: string[]
  gateways: BillBulkPostGatewayRow[]
  onClose: () => void
  onComplete?: (summary: BillBulkPostSummary) => void
}

function errorPhaseLabel(phase: BillBulkPostResult['errorPhase']): string {
  if (phase === 'aps_send') return 'APS send money failed'
  if (phase === 'ledger') return 'Ledger post failed'
  if (phase === 'validation') return 'Could not process'
  return 'Failed'
}

function dateInputToIso(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toISOString()
}

export function MerchantBillBulkPostModal({
  open,
  businessId,
  billIds,
  gateways,
  onClose,
  onComplete,
}: Props) {
  const [step, setStep] = useState<Step>('gateway')
  const [gatewayCode, setGatewayCode] = useState('')
  const [accounts, setAccounts] = useState<AccountingAccountRow[]>([])
  const [settlementId, setSettlementId] = useState('')
  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [previewItems, setPreviewItems] = useState<BillBulkPostPreviewItem[]>([])
  const [results, setResults] = useState<BillBulkPostResult[]>([])
  const [resultSummary, setResultSummary] = useState<BillBulkPostSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedGateway = useMemo(
    () => gateways.find((g) => g.code === gatewayCode) ?? null,
    [gateways, gatewayCode],
  )
  const isAps = selectedGateway?.checkoutAdapter === 'aps_wallet'

  const reset = useCallback(() => {
    setStep('gateway')
    setGatewayCode(gateways[0]?.code ?? '')
    setSettlementId('')
    setPostedAt(new Date().toISOString().slice(0, 10))
    setPreviewItems([])
    setResults([])
    setResultSummary(null)
    setError(null)
  }, [gateways])

  useEffect(() => {
    if (!open) return
    reset()
    void (async () => {
      try {
        const chart = await fetchAccountingSummary(businessId)
        const assets = chart.accounts.filter((a) => a.category === 'ASSET')
        setAccounts(assets)
        setSettlementId(assets[0]?.id ?? '')
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load chart of accounts.')
      }
    })()
  }, [open, reset, businessId])

  useEffect(() => {
    if (open && gateways.length && !gatewayCode) {
      setGatewayCode(gateways[0].code)
    }
  }, [open, gateways, gatewayCode])

  const loadPreview = async () => {
    setLoading(true)
    setError(null)
    try {
      const preview = await previewBillBulkPost(businessId, billIds)
      setPreviewItems(preview.items)
      setStep('preview')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load preview.')
    } finally {
      setLoading(false)
    }
  }

  const apsBlocked = useMemo(() => {
    if (!isAps) return false
    return previewItems.some((item) => !item.contactPhoneNormalized)
  }, [isAps, previewItems])

  const resultCounts = useMemo(() => {
    const succeeded = results.filter((r) => r.success).length
    return { succeeded, failed: results.length - succeeded }
  }, [results])

  const handleClose = () => {
    if (resultSummary && onComplete) {
      onComplete(resultSummary)
    }
    onClose()
  }

  const handleExecute = async () => {
    if (!gatewayCode || !settlementId) return
    setLoading(true)
    setError(null)
    try {
      const summary = await executeBillBulkPost(businessId, {
        billIds,
        gatewayCode,
        settlementChartAccountId: settlementId,
        postedAt: dateInputToIso(postedAt),
      })
      setResults(summary.results)
      setResultSummary(summary)
      setStep('results')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bulk post could not be started.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="presentation">
      <ModalOverlay
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onClick={() => {
          if (!loading) handleClose()
        }}
      />
      <CenteredModal className="relative z-10 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-md border border-qb-border bg-white shadow-2xl">
        <div className="border-b border-qb-border px-5 py-4">
          <h2 className="text-lg font-semibold text-qb-heading">Bulk post bills</h2>
          <p className="mt-1 text-sm text-qb-muted">
            {billIds.length} bill{billIds.length === 1 ? '' : 's'} selected
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <div
              role="alert"
              className="mb-3 flex gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          {step === 'gateway' ? (
            <div className="space-y-3">
              <p className="text-sm text-qb-muted">
                Choose a wallet from your Merchant API configuration.
              </p>
              {gateways.length === 0 ? (
                <p className="text-sm text-qb-muted">
                  No checkout wallets configured. Add credentials under Merchant API.
                </p>
              ) : null}
              <div className="space-y-2">
                {gateways.map((g) => {
                  const img = checkoutWalletBrandImageSrc(g.checkoutAdapter)
                  const checked = gatewayCode === g.code
                  return (
                    <label
                      key={g.code}
                      className={`flex cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 ${
                        checked ? 'border-qb-primary bg-qb-surface/40' : 'border-qb-border'
                      }`}
                    >
                      <input
                        type="radio"
                        name="merchant-bulk-gateway"
                        checked={checked}
                        onChange={() => setGatewayCode(g.code)}
                      />
                      {img ? (
                        <img src={img} alt="" className="h-8 w-8 rounded object-contain" />
                      ) : null}
                      <div>
                        <p className="text-sm font-medium text-qb-heading">{g.name}</p>
                        <p className="text-xs text-qb-muted">
                          {g.checkoutAdapter === 'aps_wallet'
                            ? 'Sends money via APS Wallet, then posts to GL'
                            : 'Posts to GL only (no wallet send)'}
                        </p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ) : null}

          {step === 'settlement' ? (
            <div className="space-y-4">
              <p className="text-sm text-qb-muted">
                Settlement account for the ledger entry when bills are marked paid.
              </p>
              <label className="block text-sm">
                <span className="text-qb-muted">Settlement account</span>
                <select
                  value={settlementId}
                  onChange={(e) => setSettlementId(e.target.value)}
                  className="mt-1 block w-full rounded-sm border border-qb-border px-2 py-1.5"
                >
                  <option value="">Select…</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-qb-muted">Posted date</span>
                <input
                  type="date"
                  value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  className="mt-1 block rounded-sm border border-qb-border px-2 py-1.5"
                />
              </label>
            </div>
          ) : null}

          {step === 'preview' ? (
            <div className="space-y-3">
              <p className="text-sm text-qb-muted">
                Review amounts and contacts before sending. Gateway:{' '}
                <span className="font-medium text-qb-heading">{selectedGateway?.name}</span>
              </p>
              {isAps && apsBlocked ? (
                <p className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  One or more contacts are missing a mobile number. Add mobile numbers on the{' '}
                  <Link to={APP_PATHS.contacts} className="font-medium underline">
                    Contacts
                  </Link>{' '}
                  page before using APS Wallet.
                </p>
              ) : null}
              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-qb-surface/50 text-xs uppercase text-qb-muted">
                    <tr>
                      <th className="px-3 py-2">Bill</th>
                      <th className="px-3 py-2">Contact</th>
                      <th className="px-3 py-2">Mobile</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Narrations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewItems.map((item) => (
                      <tr key={item.billId} className="border-t border-qb-border">
                        <td className="px-3 py-2 font-mono">{item.publicCode ?? '—'}</td>
                        <td className="px-3 py-2">{item.contactName ?? '—'}</td>
                        <td className="px-3 py-2">
                          {item.contactPhone ? (
                            item.contactPhone
                          ) : (
                            <span className="text-amber-700">Missing</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {item.amount != null ? (
                            <>
                              {formatMoney(item.amount)} {item.currency}
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="max-w-xs px-3 py-2 text-xs text-qb-muted">
                          <ul className="list-inside list-disc">
                            {item.narrations.map((n, i) => (
                              <li key={i}>{n}</li>
                            ))}
                          </ul>
                          {item.warnings.length > 0 ? (
                            <p className="mt-1 text-amber-700">{item.warnings.join(' ')}</p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {step === 'results' ? (
            <div className="space-y-4">
              {resultCounts.failed === 0 ? (
                <div
                  role="status"
                  className="flex gap-2 rounded-sm border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-900"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">All payments completed</p>
                    <p className="mt-0.5">
                      {resultCounts.succeeded} bill{resultCounts.succeeded === 1 ? '' : 's'} posted
                      successfully.
                    </p>
                  </div>
                </div>
              ) : resultCounts.succeeded === 0 ? (
                <div
                  role="alert"
                  className="flex gap-2 rounded-sm border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900"
                >
                  <XCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Bulk post failed</p>
                    <p className="mt-0.5">
                      No bills were posted. Review the errors below — bills with APS send failures were
                      not marked paid.
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  role="alert"
                  className="flex gap-2 rounded-sm border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"
                >
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-semibold">Completed with errors</p>
                    <p className="mt-0.5">
                      {resultCounts.succeeded} succeeded, {resultCounts.failed} failed. Failed bills
                      remain approved and unpaid.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {results.map((r) => {
                  const item = previewItems.find((p) => p.billId === r.billId)
                  const code = r.publicCode ?? item?.publicCode ?? r.billId
                  const contact = r.contactName ?? item?.contactName
                  const phone = r.contactPhone ?? item?.contactPhone
                  const amount = r.amount ?? item?.amount
                  const currency = r.currency ?? item?.currency

                  return (
                    <div
                      key={r.billId}
                      className={`rounded-sm border px-3 py-3 text-sm ${
                        r.success ? 'border-green-200 bg-green-50/80' : 'border-red-200 bg-red-50/90'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-semibold text-qb-heading">{code}</span>
                          {contact ? <span className="ml-2 text-qb-muted">{contact}</span> : null}
                        </div>
                        {r.success ? (
                          <span className="inline-flex items-center gap-1 text-green-800">
                            <CheckCircle2 className="h-4 w-4" />
                            Posted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-medium text-red-800">
                            <XCircle className="h-4 w-4" />
                            {errorPhaseLabel(r.errorPhase)}
                          </span>
                        )}
                      </div>

                      {!r.success && amount != null ? (
                        <p className="mt-1 text-xs text-red-900/80">
                          {formatMoney(amount)} {currency}
                          {phone ? ` · ${phone}` : ''}
                        </p>
                      ) : null}

                      {r.success && r.transactionId ? (
                        <p className="mt-1 text-xs text-green-800">Transaction: {r.transactionId}</p>
                      ) : null}

                      {!r.success && r.error ? (
                        <p className="mt-2 rounded-sm border border-red-200/80 bg-white/60 px-2 py-1.5 text-sm text-red-900">
                          {r.error}
                        </p>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-qb-border px-5 py-4">
          <button
            type="button"
            disabled={loading}
            onClick={handleClose}
            className="rounded-sm border border-qb-border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {step === 'results' ? 'Close' : 'Cancel'}
          </button>
          {step === 'gateway' ? (
            <button
              type="button"
              disabled={loading || !gatewayCode}
              onClick={() => setStep('settlement')}
              className="rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Next
            </button>
          ) : null}
          {step === 'settlement' ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => setStep('gateway')}
                className="rounded-sm border border-qb-border px-4 py-2 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading || !settlementId}
                onClick={() => void loadPreview()}
                className="inline-flex items-center gap-2 rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Preview
              </button>
            </>
          ) : null}
          {step === 'preview' ? (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={() => setStep('settlement')}
                className="rounded-sm border border-qb-border px-4 py-2 text-sm font-medium"
              >
                Back
              </button>
              <button
                type="button"
                disabled={loading || apsBlocked || previewItems.every((i) => !i.eligible)}
                onClick={() => void handleExecute()}
                className="inline-flex items-center gap-2 rounded-sm bg-qb-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm & post
              </button>
            </>
          ) : null}
        </div>
      </CenteredModal>
    </div>
  )
}
