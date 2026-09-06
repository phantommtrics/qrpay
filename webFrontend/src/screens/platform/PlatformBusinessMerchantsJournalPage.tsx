import { useMemo } from 'react'

import { downloadCsv, downloadFinancePdf } from '../../utils/financeReportExport'
import { formatMoney } from '../../utils/formatMoney'
import { BusinessMerchantsReportChrome } from './businessMerchants/BusinessMerchantsReportChrome'
import {
  buildReportByDate,
  flattenSectionsForExport,
  type JournalFlatRow,
} from './businessMerchants/journalGrouping'
import { useBusinessMerchantsReport } from './businessMerchants/useBusinessMerchantsReport'

export function PlatformBusinessMerchantsJournalPage() {
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
  } = useBusinessMerchantsReport('journal')

  const reportByDate = useMemo(() => buildReportByDate(report), [report])
  const exportRows = useMemo(
    () => flattenSectionsForExport(reportByDate, report?.categories ?? []),
    [reportByDate, report],
  )
  const periodGrandTotal = useMemo(
    () => reportByDate.reduce((sum, b) => sum + b.dayTotal, 0),
    [reportByDate],
  )

  const exportCsv = () => {
    if (!report) return
    const headers = ['Date', 'Merchant', 'Payment channel', 'Recorded by', 'Category', 'Amount']
    const rows =
      exportRows.length > 0
        ? [
            ...exportRows.map((r) => [
              r.saleDate,
              r.merchant,
              r.channel,
              r.recordedBy,
              r.categoryCsv,
              r.amount.toFixed(2),
            ]),
            ['', '', '', '', 'Grand total', periodGrandTotal.toFixed(2)],
          ]
        : [['—', '—', '—', '—', 'No sales in period', '0.00']]
    downloadCsv(`merchant-journal-${from}-${to}.csv`, headers, rows)
  }

  const exportPdf = async () => {
    if (!report) return
    await downloadFinancePdf({
      title: 'Business merchants journal',
      subtitle: `${periodLabel} · ${report.currency}`,
      filename: `merchant-journal-${from}-${to}.pdf`,
      sections:
        exportRows.length === 0
          ? [
              {
                heading: 'Summary',
                headers: ['Note'],
                rows: [['No completed order payments in this period.']],
                columnWeights: [1],
                columnAlign: ['left'],
              },
            ]
          : [
              {
                heading: 'Sales by merchant and category',
                headers: ['Date', 'Merchant', 'Payment channel', 'Recorded by', 'Category', 'Amount'],
                rows: exportRows.map((r) => [
                  r.saleDate,
                  r.merchant,
                  r.channel,
                  r.recordedBy,
                  r.categoryCsv,
                  formatMoney(r.amount, { decimals: 2 }),
                ]),
                rowsTypography: exportRows.map((r) =>
                  r.categoryDepth === 0 ? { bold: true, fontSize: 9 } : { bold: false, fontSize: 8 },
                ),
                footerRow: [
                  '',
                  '',
                  '',
                  '',
                  `Grand total · ${periodLabel}`,
                  formatMoney(periodGrandTotal, { decimals: 2 }),
                ],
                columnWeights: [0.7, 1.1, 0.95, 0.9, 1.6, 0.7],
                columnAlign: ['left', 'left', 'left', 'left', 'left', 'right'],
              },
            ],
    })
  }

  return (
    <BusinessMerchantsReportChrome
      title="Journal"
      description="Completed POS order payments across all merchants."
      deniedMessage="You do not have access to the business merchants journal."
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
                <th className="py-3 pr-3 font-medium">Payment channel</th>
                <th className="py-3 pr-3 font-medium">Recorded by</th>
                <th className="py-3 pr-3 font-medium">Category</th>
                <th className="py-3 text-right font-medium whitespace-nowrap">Amount</th>
              </tr>
            </thead>
            {reportByDate.length === 0 ? (
              <tbody>
                <tr className="border-b border-slate-200">
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No completed order payments in this period.
                  </td>
                </tr>
              </tbody>
            ) : (
              <>
                {reportByDate.map((block) => {
                  const blockRows = flattenSectionsForExport([block], report.categories)
                  let rowCursor = 0
                  return (
                    <tbody key={block.saleDate}>
                      {block.merchants.map((merch) => {
                        const merchRowCount = flattenSectionsForExport(
                          [{ ...block, merchants: [merch], dayTotal: merch.merchantDayTotal }],
                          report.categories,
                        ).length
                        const merchRows = blockRows.slice(rowCursor, rowCursor + merchRowCount)
                        rowCursor += merchRowCount
                        return (
                          <MerchantDayRows
                            key={`${block.saleDate}-${merch.businessId}`}
                            rows={merchRows}
                            saleDate={block.saleDate}
                            merchantName={merch.businessName}
                            merchantTotal={merch.merchantDayTotal}
                          />
                        )
                      })}
                      <tr className="border-b border-slate-300 bg-slate-50/80 text-slate-800">
                        <td colSpan={5} className="py-2.5 pr-3 text-xs font-semibold uppercase tracking-wide">
                          Day subtotal · {block.saleDate}
                        </td>
                        <td className="py-2.5 text-right text-sm font-semibold tabular-nums">
                          {formatMoney(block.dayTotal, { decimals: 2 })}
                        </td>
                      </tr>
                    </tbody>
                  )
                })}
                <tfoot>
                  <tr className="border-t-2 border-slate-900">
                    <td colSpan={6} className="p-0 pt-3 pb-3">
                      <div className="flex justify-end pr-1">
                        <div className="inline-block max-w-full text-right [border-bottom-style:double] border-b-[3px] border-slate-900 pb-2">
                          <div className="flex flex-row flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5">
                            <span className="text-sm font-bold text-slate-900 whitespace-nowrap">
                              Grand total · {periodLabel}
                            </span>
                            <span className="text-lg font-bold tabular-nums text-slate-900 whitespace-nowrap">
                              {formatMoney(periodGrandTotal, { decimals: 2 })}
                            </span>
                          </div>
                        </div>
                      </div>
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

function MerchantDayRows({
  rows,
  saleDate,
  merchantName,
  merchantTotal,
}: {
  rows: JournalFlatRow[]
  saleDate: string
  merchantName: string
  merchantTotal: number
}) {
  return (
    <>
      {rows.map((r, i) => {
        const parentRow = r.categoryDepth === 0
        return (
          <tr key={`${saleDate}-${merchantName}-${i}`} className="border-b border-slate-200">
            <td
              className={`py-3 pr-3 align-top tabular-nums whitespace-nowrap ${
                parentRow ? 'text-sm font-semibold text-slate-700' : 'text-slate-600'
              }`}
            >
              {r.saleDate}
            </td>
            <td
              className={`py-3 pr-3 align-top ${
                parentRow ? 'text-sm font-semibold text-slate-900' : 'text-slate-800'
              }`}
            >
              {r.merchant}
            </td>
            <td
              className={`py-3 pr-3 align-top ${
                parentRow ? 'text-sm font-semibold text-slate-900' : 'text-slate-800'
              }`}
            >
              {r.channel}
            </td>
            <td
              className={`py-3 pr-3 align-top ${
                parentRow ? 'text-sm font-semibold text-slate-800' : 'text-slate-700'
              }`}
            >
              {r.recordedBy}
            </td>
            <td
              style={{ paddingLeft: `${4 + r.categoryDepth * 14}px` }}
              className={
                parentRow
                  ? 'py-3 pr-3 align-top text-base font-bold leading-snug text-slate-900'
                  : 'py-3 pr-3 align-top text-sm font-normal leading-snug text-slate-700'
              }
            >
              {r.categoryPath}
            </td>
            <td
              className={
                parentRow
                  ? 'py-3 text-right align-top text-base font-bold tabular-nums text-slate-900 whitespace-nowrap'
                  : 'py-3 text-right align-top text-sm font-medium tabular-nums text-slate-900 whitespace-nowrap'
              }
            >
              {formatMoney(r.amount, { decimals: 2 })}
            </td>
          </tr>
        )
      })}
      <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-700">
        <td colSpan={5} className="py-2 pr-3 text-xs font-medium">
          Merchant subtotal · {merchantName} · {saleDate}
        </td>
        <td className="py-2 text-right text-sm font-semibold tabular-nums">
          {formatMoney(merchantTotal, { decimals: 2 })}
        </td>
      </tr>
    </>
  )
}
