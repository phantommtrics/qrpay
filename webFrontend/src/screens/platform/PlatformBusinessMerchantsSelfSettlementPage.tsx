import { useMemo } from 'react'

import { downloadCsv, downloadFinancePdf } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'
import { BusinessMerchantsReportChrome } from './businessMerchants/BusinessMerchantsReportChrome'
import { channelPairLabel } from './businessMerchants/reportDatePresets'
import { useBusinessMerchantsReport } from './businessMerchants/useBusinessMerchantsReport'

export function PlatformBusinessMerchantsSelfSettlementPage() {
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
  } = useBusinessMerchantsReport('settlement')

  const payoutSorted = useMemo(() => {
    const list = report?.payoutRows ?? []
    return [...list].sort((a, b) => {
      const date = a.payoutDate.localeCompare(b.payoutDate)
      if (date !== 0) return date
      const merch = a.businessName.localeCompare(b.businessName, undefined, { sensitivity: 'base' })
      if (merch !== 0) return merch
      return a.payoutId.localeCompare(b.payoutId)
    })
  }, [report])

  const totals = useMemo(
    () =>
      payoutSorted.reduce(
        (acc, r) => ({
          gross: acc.gross + r.grossAmount,
          withhold: acc.withhold + r.withholdAmount,
          receive: acc.receive + r.receiveAmount,
        }),
        { gross: 0, withhold: 0, receive: 0 },
      ),
    [payoutSorted],
  )

  const exportCsv = () => {
    if (!report) return
    const headers = [
      'Date',
      'Merchant',
      'Linked channel',
      'Recipient',
      'Wave payout id',
      'Gross',
      'Withhold',
      'Paid to merchant',
    ]
    const rows =
      payoutSorted.length > 0
        ? [
            ...payoutSorted.map((r) => [
              r.payoutDate,
              r.businessName,
              channelPairLabel(r.paymentMethod, r.paymentProvider),
              `${r.recipientName}${r.recipientMobile ? ` (${r.recipientMobile})` : ''}`,
              r.wavePayoutId ?? '',
              r.grossAmount.toFixed(2),
              r.withholdAmount.toFixed(2),
              r.receiveAmount.toFixed(2),
            ]),
            [
              'Total',
              '',
              '',
              '',
              '',
              totals.gross.toFixed(2),
              totals.withhold.toFixed(2),
              totals.receive.toFixed(2),
            ],
          ]
        : [['—', 'No payouts in period', '—', '—', '—', '0.00', '0.00', '0.00']]
    downloadCsv(`merchant-self-settlement-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!report) return
    await downloadFinancePdf({
      title: 'Business merchants self settlement',
      subtitle: `${periodLabel} · ${report.currency}`,
      filename: `merchant-self-settlement-${from}-${to}.pdf`,
      sections:
        payoutSorted.length === 0
          ? [
              {
                heading: 'Summary',
                headers: ['Note'],
                rows: [['No succeeded merchant payouts in this period.']],
                columnWeights: [1],
                columnAlign: ['left'],
              },
            ]
          : [
              {
                heading: 'Merchant payouts (on behalf)',
                headers: [
                  'Date',
                  'Merchant',
                  'Recipient',
                  'Wave payout id',
                  'Gross',
                  'Withhold',
                  'Paid to merchant',
                ],
                rows: payoutSorted.map((r) => [
                  r.payoutDate,
                  r.businessName,
                  `${r.recipientName}${r.recipientMobile ? ` (${r.recipientMobile})` : ''}`,
                  r.wavePayoutId ?? '',
                  formatMoney(r.grossAmount, { decimals: 2 }),
                  formatMoney(r.withholdAmount, { decimals: 2 }),
                  formatMoney(r.receiveAmount, { decimals: 2 }),
                ]),
                footerRow: [
                  'Total',
                  '',
                  '',
                  '',
                  formatMoney(totals.gross, { decimals: 2 }),
                  formatMoney(totals.withhold, { decimals: 2 }),
                  formatMoney(totals.receive, { decimals: 2 }),
                ],
                columnWeights: [0.7, 1.1, 1.3, 1.1, 0.7, 0.7, 0.85],
                columnAlign: ['left', 'left', 'left', 'left', 'right', 'right', 'right'],
              },
            ],
    })
  }

  return (
    <BusinessMerchantsReportChrome
      title="Self settlement"
      description="Succeeded Wave self-settlement payouts sent on behalf of merchants."
      deniedMessage="You do not have access to the business merchants self settlement report."
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
          <table className="w-full min-w-[880px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-3 font-medium whitespace-nowrap">Date</th>
                <th className="py-3 pr-3 font-medium">Merchant</th>
                <th className="py-3 pr-3 font-medium">Linked channel</th>
                <th className="py-3 pr-3 font-medium">Recipient</th>
                <th className="py-3 pr-3 font-medium">Wave payout id</th>
                <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Gross</th>
                <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Withhold</th>
                <th className="py-3 text-right font-medium whitespace-nowrap">Paid to merchant</th>
              </tr>
            </thead>
            {payoutSorted.length === 0 ? (
              <tbody>
                <tr className="border-b border-slate-200">
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No succeeded merchant payouts in this period.
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                <tbody>
                  {payoutSorted.map((r) => (
                    <tr key={r.payoutId} className="border-b border-slate-200">
                      <td className="py-3 pr-3 tabular-nums whitespace-nowrap text-slate-600">{r.payoutDate}</td>
                      <td className="py-3 pr-3 text-slate-800">{r.businessName}</td>
                      <td className="py-3 pr-3 text-slate-800">
                        {channelPairLabel(r.paymentMethod, r.paymentProvider)}
                      </td>
                      <td className="py-3 pr-3 text-slate-800">
                        <span className="block">{r.recipientName || '—'}</span>
                        {r.recipientMobile ? (
                          <span className="block text-xs text-slate-500">{r.recipientMobile}</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-3 font-mono text-xs text-slate-700">{r.wavePayoutId ?? '—'}</td>
                      <td className="py-3 pr-3 text-right tabular-nums text-slate-800">
                        {formatMoney(r.grossAmount, { decimals: 2 })}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-slate-800">
                        {formatMoney(r.withholdAmount, { decimals: 2 })}
                      </td>
                      <td className="py-3 text-right tabular-nums font-medium text-slate-900">
                        {formatMoney(r.receiveAmount, { decimals: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50/80">
                    <td
                      colSpan={5}
                      className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-700"
                    >
                      Total
                    </td>
                    <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.gross, { decimals: 2 })}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.withhold, { decimals: 2 })}
                    </td>
                    <td className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.receive, { decimals: 2 })}
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
