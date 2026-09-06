import { useMemo } from 'react'

import { downloadCsv, downloadFinancePdf } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'
import { BusinessMerchantsReportChrome } from './businessMerchants/BusinessMerchantsReportChrome'
import { channelPairLabel } from './businessMerchants/reportDatePresets'
import { useBusinessMerchantsReport } from './businessMerchants/useBusinessMerchantsReport'

function formatCompletedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString()
}

export function PlatformBusinessMerchants360JournalPage() {
  const {
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
    report,
    loading,
    error,
    loadReport,
  } = useBusinessMerchantsReport('360')

  const paymentRows = useMemo(() => report?.paymentRows ?? [], [report])

  const totals = useMemo(
    () =>
      paymentRows.reduce(
        (acc, r) => ({
          amount: acc.amount + r.paymentAmount,
          fee: acc.fee + r.walletFeeLedgerTotal,
          net: acc.net + (r.paymentAmount - r.walletFeeLedgerTotal),
        }),
        { amount: 0, fee: 0, net: 0 },
      ),
    [paymentRows],
  )

  const exportCsv = () => {
    if (!report) return
    const headers = [
      'Completed at',
      'Merchant',
      'Payment',
      'Order',
      'Received from',
      'Recorded by',
      'Provider ref',
      'Amount',
      'Fee',
      'Net',
    ]
    const rows =
      paymentRows.length > 0
        ? [
            ...paymentRows.map((r) => [
              formatCompletedAt(r.completedAt),
              r.businessName,
              r.paymentPublicCode,
              r.orderPublicCode ?? '',
              channelPairLabel(r.paymentMethod, r.paymentProvider),
              r.recordedByName ?? 'Guest / unassigned',
              r.providerRef,
              r.paymentAmount.toFixed(2),
              r.walletFeeLedgerTotal.toFixed(2),
              (r.paymentAmount - r.walletFeeLedgerTotal).toFixed(2),
            ]),
            [
              'Total',
              '',
              '',
              '',
              '',
              '',
              '',
              totals.amount.toFixed(2),
              totals.fee.toFixed(2),
              totals.net.toFixed(2),
            ],
          ]
        : [['—', 'No payments in period', '—', '—', '—', '—', '—', '0.00', '0.00', '0.00']]
    downloadCsv(`merchant-360-journal-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!report) return
    await downloadFinancePdf({
      title: 'Business merchants 360 journal',
      subtitle: `${periodLabel} · ${report.currency}`,
      filename: `merchant-360-journal-${from}-${to}.pdf`,
      sections:
        paymentRows.length === 0
          ? [
              {
                heading: 'Summary',
                headers: ['Note'],
                rows: [['No completed payments in this period.']],
                columnWeights: [1],
                columnAlign: ['left'],
              },
            ]
          : [
              {
                heading: 'Detail transactions',
                headers: [
                  'Completed at',
                  'Merchant',
                  'Payment',
                  'Received from',
                  'Amount',
                  'Fee',
                  'Net',
                ],
                rows: paymentRows.map((r) => [
                  formatCompletedAt(r.completedAt),
                  r.businessName,
                  r.paymentPublicCode,
                  channelPairLabel(r.paymentMethod, r.paymentProvider),
                  formatMoney(r.paymentAmount, { decimals: 2 }),
                  formatMoney(r.walletFeeLedgerTotal, { decimals: 2 }),
                  formatMoney(r.paymentAmount - r.walletFeeLedgerTotal, { decimals: 2 }),
                ]),
                footerRow: [
                  'Total',
                  '',
                  '',
                  '',
                  formatMoney(totals.amount, { decimals: 2 }),
                  formatMoney(totals.fee, { decimals: 2 }),
                  formatMoney(totals.net, { decimals: 2 }),
                ],
                columnWeights: [1.1, 1.1, 0.9, 1.1, 0.7, 0.65, 0.7],
                columnAlign: ['left', 'left', 'left', 'left', 'right', 'right', 'right'],
              },
            ],
    })
  }

  return (
    <BusinessMerchantsReportChrome
      title="360 journal"
      description="Every completed POS payment across merchants, with the channel the money was received from and the wallet fee on that payment."
      deniedMessage="You do not have access to the business merchants 360 journal."
      canView={canView}
      canExport={canExport}
      datePreset={datePreset}
      setDatePreset={setDatePreset}
      from={from}
      setFrom={setFrom}
      to={to}
      setTo={setTo}
      merchantId={merchantId}
      setMerchantId={setMerchantId}
      merchantSelectOptions={merchantSelectOptions}
      periodLabel={periodLabel}
      currency={report?.currency}
      loading={loading}
      error={error}
      onRefresh={loadReport}
      exportDisabled={!report}
      onExportCsv={exportCsv}
      onExportPdf={exportPdf}
    >
      {!loading && report ? (
        <div className="overflow-x-auto pt-6">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-3 font-medium whitespace-nowrap">Completed at</th>
                <th className="py-3 pr-3 font-medium">Merchant</th>
                <th className="py-3 pr-3 font-medium">Payment</th>
                <th className="py-3 pr-3 font-medium">Received from</th>
                <th className="py-3 pr-3 font-medium">Recorded by</th>
                <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Amount</th>
                <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Fee</th>
                <th className="py-3 text-right font-medium whitespace-nowrap">Net</th>
              </tr>
            </thead>
            {paymentRows.length === 0 ? (
              <tbody>
                <tr className="border-b border-slate-200">
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No completed payments in this period.
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                <tbody>
                  {paymentRows.map((r) => {
                    const net = r.paymentAmount - r.walletFeeLedgerTotal
                    return (
                      <tr key={r.paymentId} className="border-b border-slate-200">
                        <td className="py-3 pr-3 align-top tabular-nums whitespace-nowrap text-slate-600">
                          {formatCompletedAt(r.completedAt)}
                        </td>
                        <td className="py-3 pr-3 align-top text-slate-800">{r.businessName}</td>
                        <td className="py-3 pr-3 align-top text-slate-800">
                          <span className="block font-medium">{r.paymentPublicCode}</span>
                          {r.orderPublicCode ? (
                            <span className="block text-xs text-slate-500">{r.orderPublicCode}</span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 align-top text-slate-800">
                          <span className="block">
                            {channelPairLabel(r.paymentMethod, r.paymentProvider)}
                          </span>
                          {r.gatewayCode ? (
                            <span className="block text-xs text-slate-500">{r.gatewayCode}</span>
                          ) : null}
                          {r.providerRef ? (
                            <span className="mt-0.5 block font-mono text-xs text-slate-500">
                              {r.providerRef}
                            </span>
                          ) : null}
                        </td>
                        <td className="py-3 pr-3 align-top text-slate-700">
                          {r.recordedByName ?? 'Guest / unassigned'}
                        </td>
                        <td className="py-3 pr-3 align-top text-right tabular-nums text-slate-800">
                          {formatMoney(r.paymentAmount, { decimals: 2 })}
                        </td>
                        <td className="py-3 pr-3 align-top text-right tabular-nums text-slate-800">
                          {formatMoney(r.walletFeeLedgerTotal, { decimals: 2 })}
                        </td>
                        <td className="py-3 align-top text-right tabular-nums font-medium text-slate-900">
                          {formatMoney(net, { decimals: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50/80">
                    <td
                      colSpan={5}
                      className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-700"
                    >
                      Total · {paymentRows.length} payment{paymentRows.length === 1 ? '' : 's'}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.amount, { decimals: 2 })}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.fee, { decimals: 2 })}
                    </td>
                    <td className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.net, { decimals: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </>
            )}
          </table>
        </div>
      ) : null}
    </BusinessMerchantsReportChrome>
  )
}
