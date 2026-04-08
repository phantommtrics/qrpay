import { EasypayLogoMark } from '../branding/EasypayLogoMark'
import type { BillRow, SalesInvoiceRow, SalesQuotationRow } from '../../services/salesDocumentsApi'
import { formatMoney } from '../../utils/formatMoney'

function formatDocDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function lineAmount(l: { quantity: number; unitAmount: number; taxAmount: number }): number {
  return l.quantity * l.unitAmount + l.taxAmount
}

function subtotalExTax(
  lines: { quantity: number; unitAmount: number; taxAmount: number }[],
): number {
  return lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0)
}

function totalInclTax(
  lines: { quantity: number; unitAmount: number; taxAmount: number }[],
): number {
  return lines.reduce((s, l) => s + lineAmount(l), 0)
}

type PaperProps =
  | {
      variant: 'quotation'
      document: SalesQuotationRow
      businessName: string
    }
  | {
      variant: 'invoice'
      document: SalesInvoiceRow
      businessName: string
    }
  | {
      variant: 'bill'
      document: BillRow
      businessName: string
    }

/** Printable A4-style document body (no modal shell). */
export function SalesDocumentPaper(props: PaperProps) {
  const doc = props.document
  const currency = doc.currency
  const lines = [...doc.lines].sort((a, b) => a.sortOrder - b.sortOrder)
  const sub = subtotalExTax(lines)
  const total = totalInclTax(lines)

  const title =
    props.variant === 'quotation'
      ? 'Quotation'
      : props.variant === 'bill'
        ? 'Purchase bill'
        : 'Sales invoice'
  const code = doc.publicCode

  const statusLabel =
    props.variant === 'quotation'
      ? props.document.status
      : props.document.status.toUpperCase()

  return (
    <article
      id="sales-doc-print-root"
      className="w-full max-w-[210mm] border border-slate-200 bg-white shadow-sm print:max-w-none print:border-0 print:shadow-none"
    >
      <div className="border-b border-slate-200 px-6 pb-6 pt-8 sm:px-10 sm:pb-8 sm:pt-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 max-w-full">
            <EasypayLogoMark className="mb-4 h-10 w-auto max-w-[min(100%,260px)] object-contain object-left sm:h-11" />
            <p className="font-serif text-xl font-semibold tracking-tight text-slate-900">
              {props.businessName}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p className="font-mono text-lg font-semibold tabular-nums text-slate-900">{code}</p>
            <p className="mt-1">
              <span className="text-slate-500">Status </span>
              <span className="font-semibold text-slate-800">{statusLabel}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-6 py-8 sm:px-10">
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {props.variant === 'bill' ? 'Supplier' : 'Bill to'}
            </p>
            <p className="mt-2 text-base font-semibold text-slate-900">{doc.contact.name}</p>
            {doc.contact.email ? (
              <p className="mt-1 text-sm text-slate-600">{doc.contact.email}</p>
            ) : null}
          </div>
          <div className="space-y-2 text-sm sm:text-right">
            {props.variant === 'quotation' ? (
              <>
                <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                  <span className="text-slate-500">Valid until</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatDocDate(props.document.validUntil)}
                  </span>
                </div>
                {props.document.reference ? (
                  <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                    <span className="text-slate-500">Reference</span>
                    <span className="font-medium text-slate-900">{props.document.reference}</span>
                  </div>
                ) : null}
              </>
            ) : props.variant === 'bill' ? (
              <>
                <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                  <span className="text-slate-500">Issue date</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatDocDate(props.document.issueDate)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                  <span className="text-slate-500">Due date</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatDocDate(props.document.dueDate)}
                  </span>
                </div>
                {props.document.reference ? (
                  <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                    <span className="text-slate-500">Reference</span>
                    <span className="font-medium text-slate-900">{props.document.reference}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                  <span className="text-slate-500">Issue date</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatDocDate(props.document.issueDate)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                  <span className="text-slate-500">Due date</span>
                  <span className="font-medium tabular-nums text-slate-900">
                    {formatDocDate(props.document.dueDate)}
                  </span>
                </div>
                {props.document.reference ? (
                  <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                    <span className="text-slate-500">Reference</span>
                    <span className="font-medium text-slate-900">{props.document.reference}</span>
                  </div>
                ) : null}
                {props.document.sourceQuotation ? (
                  <div className="flex justify-between gap-4 sm:ml-auto sm:flex-col sm:items-end">
                    <span className="text-slate-500">From quotation</span>
                    <span className="font-mono font-medium text-slate-900">
                      {props.document.sourceQuotation.publicCode}
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3">Account</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Unit</th>
                <th className="py-2 pr-3 text-right">Tax</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id} className="align-top text-slate-800">
                  <td className="py-3 pr-3">
                    <span className="font-medium">{l.narration || '—'}</span>
                    {l.unitLabel ? <span className="ml-1 text-slate-500">({l.unitLabel})</span> : null}
                  </td>
                  <td className="py-3 pr-3 text-slate-600">
                    {l.chartOfAccount ? (
                      <span>
                        {l.chartOfAccount.code} — {l.chartOfAccount.name}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">{l.quantity}</td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {formatMoney(l.unitAmount, { decimals: 2 })}
                  </td>
                  <td className="py-3 pr-3 text-right tabular-nums">
                    {formatMoney(l.taxAmount, { decimals: 2 })}
                  </td>
                  <td className="py-3 text-right tabular-nums font-medium">
                    {formatMoney(lineAmount(l), { decimals: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="ml-auto w-full max-w-xs space-y-2 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between gap-4 text-slate-600">
            <span>Subtotal (ex. tax)</span>
            <span className="tabular-nums font-medium text-slate-900">
              {formatMoney(sub, { decimals: 2 })} {currency}
            </span>
          </div>
          <div className="flex justify-between gap-4 text-lg font-semibold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(total, { decimals: 2 })} {currency}
            </span>
          </div>
        </div>

        {(props.variant === 'invoice' || props.variant === 'bill') && props.document.journalEntry ? (
          <p className="border-t border-slate-100 pt-4 text-xs text-slate-500">
            Ledger posted {formatDocDate(props.document.journalEntry.postedAt)}.
          </p>
        ) : (
          <p className="border-t border-slate-100 pt-4 text-xs text-slate-400">
            This document is for your records. Please retain a copy for your files.
          </p>
        )}
      </div>
    </article>
  )
}
