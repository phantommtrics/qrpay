import { useMemo } from 'react'

import { downloadCsv, downloadFinancePdf } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'
import { BusinessMerchantsReportChrome } from './businessMerchants/BusinessMerchantsReportChrome'
import { channelPairLabel } from './businessMerchants/reportDatePresets'
import { useBusinessMerchantsReport } from './businessMerchants/useBusinessMerchantsReport'

export function PlatformBusinessMerchantsFeePage() {
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
  } = useBusinessMerchantsReport('fee')

  const ledgerSorted = useMemo(() => {
    const list = report?.ledgerTotals ?? []
    return [...list].sort((a, b) => {
      const merch = a.businessName.localeCompare(b.businessName, undefined, { sensitivity: 'base' })
      if (merch !== 0) return merch
      return channelPairLabel(a.paymentMethod, a.paymentProvider).localeCompare(
        channelPairLabel(b.paymentMethod, b.paymentProvider),
        undefined,
        { sensitivity: 'base' },
      )
    })
  }, [report])

  const totals = useMemo(
    () =>
      ledgerSorted.reduce(
        (acc, r) => ({
          customerSale: acc.customerSale + r.customerSaleLedgerTotal,
          walletFee: acc.walletFee + r.walletFeeLedgerTotal,
        }),
        { customerSale: 0, walletFee: 0 },
      ),
    [ledgerSorted],
  )
  const netTotal = totals.customerSale - totals.walletFee

  const exportCsv = () => {
    if (!report) return
    const headers = ['Merchant', 'Payment channel', 'CUSTOMER_SALE (sum)', 'WALLET_FEE (sum)', 'Net']
    const rows =
      ledgerSorted.length > 0
        ? [
            ...ledgerSorted.map((r) => {
              const net = r.customerSaleLedgerTotal - r.walletFeeLedgerTotal
              return [
                r.businessName,
                channelPairLabel(r.paymentMethod, r.paymentProvider),
                r.customerSaleLedgerTotal.toFixed(2),
                r.walletFeeLedgerTotal.toFixed(2),
                net.toFixed(2),
              ]
            }),
            ['Total', '', totals.customerSale.toFixed(2), totals.walletFee.toFixed(2), netTotal.toFixed(2)],
          ]
        : [['—', 'No ledger entries in period', '0.00', '0.00', '0.00']]
    downloadCsv(`merchant-fee-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!report) return
    await downloadFinancePdf({
      title: 'Business merchants fee',
      subtitle: `${periodLabel} · ${report.currency}`,
      filename: `merchant-fee-${from}-${to}.pdf`,
      sections:
        ledgerSorted.length === 0
          ? [
              {
                heading: 'Summary',
                headers: ['Note'],
                rows: [['No succeeded ledger entries in this period.']],
                columnWeights: [1],
                columnAlign: ['left'],
              },
            ]
          : [
              {
                heading: 'Sales ledger by merchant and payment channel',
                headers: ['Merchant', 'Channel', 'CUSTOMER_SALE (sum)', 'WALLET_FEE (sum)', 'Net'],
                rows: ledgerSorted.map((r) => {
                  const net = r.customerSaleLedgerTotal - r.walletFeeLedgerTotal
                  return [
                    r.businessName,
                    channelPairLabel(r.paymentMethod, r.paymentProvider),
                    formatMoney(r.customerSaleLedgerTotal, { decimals: 2 }),
                    formatMoney(r.walletFeeLedgerTotal, { decimals: 2 }),
                    formatMoney(net, { decimals: 2 }),
                  ]
                }),
                footerRow: [
                  'Total',
                  '',
                  formatMoney(totals.customerSale, { decimals: 2 }),
                  formatMoney(totals.walletFee, { decimals: 2 }),
                  formatMoney(netTotal, { decimals: 2 }),
                ],
                columnWeights: [1.2, 1.2, 0.85, 0.85, 0.7],
                columnAlign: ['left', 'left', 'right', 'right', 'right'],
              },
            ],
    })
  }

  return (
    <BusinessMerchantsReportChrome
      title="Fee"
      description="Succeeded sales ledger totals by merchant and payment channel."
      deniedMessage="You do not have access to the business merchants fee report."
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
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-medium uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-3 font-medium">Merchant</th>
                <th className="py-3 pr-3 font-medium">Payment channel</th>
                <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Customer sale (ledger)</th>
                <th className="py-3 pr-3 text-right font-medium whitespace-nowrap">Wallet fee (ledger)</th>
                <th className="py-3 text-right font-medium whitespace-nowrap">Net</th>
              </tr>
            </thead>
            {ledgerSorted.length === 0 ? (
              <tbody>
                <tr className="border-b border-slate-200">
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No succeeded ledger entries in this period.
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                <tbody>
                  {ledgerSorted.map((r) => {
                    const net = r.customerSaleLedgerTotal - r.walletFeeLedgerTotal
                    return (
                      <tr
                        key={`${r.businessId}|${r.paymentMethod}|${r.paymentProvider}|${r.gatewayCode ?? ''}`}
                        className="border-b border-slate-200"
                      >
                        <td className="py-3 pr-3 text-slate-800">{r.businessName}</td>
                        <td className="py-3 pr-3 text-slate-800">
                          {channelPairLabel(r.paymentMethod, r.paymentProvider)}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-slate-800">
                          {formatMoney(r.customerSaleLedgerTotal, { decimals: 2 })}
                        </td>
                        <td className="py-3 pr-3 text-right tabular-nums text-slate-800">
                          {formatMoney(r.walletFeeLedgerTotal, { decimals: 2 })}
                        </td>
                        <td className="py-3 text-right tabular-nums font-medium text-slate-900">
                          {formatMoney(net, { decimals: 2 })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50/80">
                    <td colSpan={2} className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide text-slate-700">
                      Total
                    </td>
                    <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.customerSale, { decimals: 2 })}
                    </td>
                    <td className="py-2.5 pr-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(totals.walletFee, { decimals: 2 })}
                    </td>
                    <td className="py-2.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {formatMoney(netTotal, { decimals: 2 })}
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
