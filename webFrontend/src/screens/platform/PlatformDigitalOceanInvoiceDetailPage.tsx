import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FileDown, Loader2 } from 'lucide-react'
import { generatePath, Link, useParams } from 'react-router-dom'

import { PageCard } from '../../components/ui/PageCard'
import { PageTransition } from '../../components/ui/PageTransition'
import { APP_PATHS } from '../../config/navigation'
import { useAuth } from '../../features/auth/AuthContext'
import {
  downloadDigitalOceanInvoicePdf,
  fetchDigitalOceanInvoiceDetail,
  fetchDigitalOceanInvoices,
  formatUsdAmount,
  postDigitalOceanInvoiceJournal,
  type DigitalOceanInvoiceDetailPayload,
  type DigitalOceanInvoiceRow,
} from '../../services/digitalOceanBillingApi'
import {
  ApiError,
  fetchPlatformAccountingChart,
  type PlatformChartAccountDetail,
} from '../../services/subscriptionApi'
import { formatMoney } from '../../utils/formatMoney'
import { isPlatformOperator } from '../../utils/platformOperator'

function isLocalInvoice(
  invoice: DigitalOceanInvoiceDetailPayload['invoice'],
): invoice is DigitalOceanInvoiceRow {
  return 'id' in invoice && 'syncedAt' in invoice
}

function roundGmd(usd: string, rate: number): string {
  const n = Number(usd) * rate
  if (!Number.isFinite(n)) return '0.00'
  return n.toFixed(2)
}

export function PlatformDigitalOceanInvoiceDetailPage() {
  const { invoiceUuid } = useParams<{ invoiceUuid: string }>()
  const { user, canAccess } = useAuth()
  const canView = canAccess('platform.digitalocean_billing.view')
  const canPost = canAccess('platform.digitalocean_billing.manage')

  const [detail, setDetail] = useState<DigitalOceanInvoiceDetailPayload | null>(null)
  const [accounts, setAccounts] = useState<PlatformChartAccountDetail[]>([])
  const [lastFx, setLastFx] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fxRate, setFxRate] = useState('70')
  const [settlementId, setSettlementId] = useState('')
  const [postedAt, setPostedAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [lineAccounts, setLineAccounts] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    if (!invoiceUuid) return
    setLoading(true)
    setError(null)
    try {
      const [d, chart, list] = await Promise.all([
        fetchDigitalOceanInvoiceDetail(invoiceUuid),
        fetchPlatformAccountingChart(),
        fetchDigitalOceanInvoices().catch(() => null),
      ])
      setDetail(d)
      setAccounts(chart)
      const firstAsset = chart.find((a) => a.category === 'ASSET')
      setSettlementId((current) => current || firstAsset?.id || '')
      if (list?.lastFxRateGmdPerUsd) {
        setLastFx(list.lastFxRateGmdPerUsd)
        setFxRate((current) => (current === '70' ? list.lastFxRateGmdPerUsd! : current))
      }
      const defaults: Record<string, string> = {}
      for (const line of d.proposedLines) {
        defaults[line.key] = line.chartOfAccountId
      }
      setLineAccounts(defaults)
    } catch (e) {
      setDetail(null)
      setError(e instanceof ApiError ? e.message : 'Could not load invoice.')
    } finally {
      setLoading(false)
    }
  }, [invoiceUuid])

  useEffect(() => {
    if (!isPlatformOperator(user) || !canView) return
    void load()
  }, [user, canView, load])

  const assets = useMemo(
    () => accounts.filter((a) => a.category === 'ASSET').sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )
  const expenses = useMemo(
    () =>
      accounts.filter((a) => a.category === 'EXPENSE').sort((a, b) => a.code.localeCompare(b.code)),
    [accounts],
  )

  const rateNum = Number(fxRate)
  const previewLines = (detail?.proposedLines ?? []).map((line) => ({
    ...line,
    chartOfAccountId: lineAccounts[line.key] || line.chartOfAccountId,
    amountGmd: Number.isFinite(rateNum) && rateNum > 0 ? roundGmd(line.amountUsd, rateNum) : '—',
  }))
  const previewTotalGmd =
    Number.isFinite(rateNum) && rateNum > 0 && detail
      ? roundGmd(
          isLocalInvoice(detail.invoice) ? detail.invoice.amountUsd : detail.invoice.amountUsd,
          rateNum,
        )
      : null

  if (!isPlatformOperator(user) || !canView) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">You do not have access to DigitalOcean billing.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const invoice = detail?.invoice
  const local = invoice && isLocalInvoice(invoice) ? invoice : null

  const onPost = async () => {
    if (!invoiceUuid || !settlementId) return
    setBusy(true)
    setError(null)
    try {
      await postDigitalOceanInvoiceJournal(invoiceUuid, {
        fxRateGmdPerUsd: fxRate,
        settlementChartAccountId: settlementId,
        postedAt,
        lines: previewLines.map((l) => ({
          key: l.key,
          chartOfAccountId: l.chartOfAccountId,
        })),
      })
      setModalOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post journal.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div>
        <Link
          to={APP_PATHS.platformDigitalOceanBilling}
          className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          DigitalOcean billing
        </Link>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          {invoice ? `Invoice ${invoice.invoiceId}` : 'DigitalOcean invoice'}
        </h1>
        {invoice ? (
          <p className="mt-2 text-slate-600">
            Period {invoice.billingPeriod} · {formatUsdAmount(invoice.amountUsd)}
            {detail?.isPreview ? ' · month-to-date preview (cannot post)' : null}
          </p>
        ) : null}
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <PageCard className="p-6">
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading invoice…
          </p>
        </PageCard>
      ) : null}

      {detail && invoice ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pdfBusy}
              onClick={async () => {
                if (!invoiceUuid) return
                setPdfBusy(true)
                setError(null)
                try {
                  await downloadDigitalOceanInvoicePdf(invoiceUuid)
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : 'Could not download PDF.')
                } finally {
                  setPdfBusy(false)
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              {pdfBusy ? 'Downloading…' : 'Download PDF'}
            </button>
            {canPost && detail.canPost ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-800"
              >
                Post to journal
              </button>
            ) : null}
          </div>

          {local?.status === 'POSTED' ? (
            <PageCard className="p-6">
              <p className="text-sm font-semibold text-slate-900">Posted to platform books</p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-slate-500">GMD amount</dt>
                  <dd className="font-medium text-slate-900">
                    {local.amountGmd ? formatMoney(Number(local.amountGmd)) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">FX rate</dt>
                  <dd className="font-medium text-slate-900">
                    {local.fxRateGmdPerUsd ? `${Number(local.fxRateGmdPerUsd).toFixed(4)} GMD / USD` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Supplier bill</dt>
                  <dd>
                    {local.platformBill ? (
                      <Link
                        to={generatePath(APP_PATHS.platformBillDetail, {
                          billId: local.platformBill.id,
                        })}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        {local.platformBill.publicCode}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Journal</dt>
                  <dd>
                    {local.platformJournalEntryId ? (
                      <Link
                        to={APP_PATHS.platformAccountingJournals}
                        className="font-medium text-teal-700 hover:underline"
                      >
                        View journals
                      </Link>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
            </PageCard>
          ) : null}

          <PageCard className="p-6">
            <h2 className="text-lg font-semibold text-slate-900">Product charges</h2>
            {invoice.summary?.productCharges?.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {invoice.summary.productCharges.map((p) => (
                  <li key={p.key} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-slate-800">
                      {p.name}
                      {p.count ? <span className="text-slate-500"> · {p.count}</span> : null}
                    </span>
                    <span className="font-medium">{formatUsdAmount(p.amountUsd)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No product grouping on this invoice snapshot.</p>
            )}
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Taxes</dt>
                <dd>{formatUsdAmount(invoice.summary?.taxesUsd ?? '0')}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Overages</dt>
                <dd>{formatUsdAmount(invoice.summary?.overagesUsd ?? '0')}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Credits &amp; adjustments</dt>
                <dd>{formatUsdAmount(invoice.summary?.creditsUsd ?? '0')}</dd>
              </div>
            </dl>
          </PageCard>

          {detail.items.length ? (
            <PageCard className="overflow-hidden p-0">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900">Line items</h2>
                <p className="text-sm text-slate-500">From DigitalOcean (resource-level usage).</p>
              </div>
              <div className="max-h-[28rem] overflow-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="sticky top-0 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-semibold">Product</th>
                      <th className="px-4 py-2 font-semibold">Description</th>
                      <th className="px-4 py-2 font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.items.map((item, i) => (
                      <tr key={`${item.resource_uuid ?? item.description ?? i}`} className="border-b border-slate-100">
                        <td className="px-4 py-2">{item.product ?? '—'}</td>
                        <td className="px-4 py-2 text-slate-600">
                          {item.group_description || item.description || '—'}
                          {item.project_name ? (
                            <span className="block text-xs text-slate-400">{item.project_name}</span>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">{formatUsdAmount(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PageCard>
          ) : null}
        </>
      ) : null}

      {modalOpen && detail?.canPost ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Post DigitalOcean invoice to journal</h2>
            <p className="mt-1 text-sm text-slate-600">
              Converts USD to GMD at your rate, creates a DigitalOcean supplier bill, and posts Dr
              Hosting / Cr settlement (cash basis).
            </p>
            {lastFx ? (
              <p className="mt-2 text-xs text-slate-500">Last posted rate: {Number(lastFx).toFixed(4)} GMD per USD</p>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-slate-600">GMD per 1 USD</span>
                <input
                  type="number"
                  min="0.000001"
                  step="0.0001"
                  value={fxRate}
                  onChange={(e) => setFxRate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600">Posted date</span>
                <input
                  type="date"
                  value={postedAt}
                  onChange={(e) => setPostedAt(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                <span className="text-slate-600">Settlement account (credit)</span>
                <select
                  value={settlementId}
                  onChange={(e) => setSettlementId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"
                >
                  <option value="">Select bank/cash asset…</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Line</th>
                    <th className="px-3 py-2">USD</th>
                    <th className="px-3 py-2">GMD</th>
                    <th className="px-3 py-2">Expense account</th>
                  </tr>
                </thead>
                <tbody>
                  {previewLines.map((line) => (
                    <tr key={line.key} className="border-t border-slate-100">
                      <td className="px-3 py-2">{line.name}</td>
                      <td className="px-3 py-2">{formatUsdAmount(line.amountUsd)}</td>
                      <td className="px-3 py-2">
                        {line.amountGmd === '—' ? '—' : formatMoney(Number(line.amountGmd))}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={line.chartOfAccountId}
                          onChange={(e) =>
                            setLineAccounts((cur) => ({ ...cur, [line.key]: e.target.value }))
                          }
                          className="w-full rounded border border-slate-200 px-2 py-1"
                        >
                          {expenses.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {previewTotalGmd ? (
              <p className="mt-3 text-sm font-medium text-slate-900">
                Journal total {formatMoney(Number(previewTotalGmd))}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !settlementId || !(rateNum > 0)}
                onClick={() => void onPost()}
                className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Posting…' : 'Confirm post'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </PageTransition>
  )
}
