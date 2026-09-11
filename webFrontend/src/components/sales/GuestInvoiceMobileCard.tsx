import { FileDown } from 'lucide-react'

import { EasypayLogoMark } from '../branding/EasypayLogoMark'
import type { SalesInvoiceRow } from '../../services/salesDocumentsApi'
import { formatMoney } from '../../utils/formatMoney'

function formatDocDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function lineAmount(l: { quantity: number; unitAmount: number; taxAmount: number }): number {
  return l.quantity * l.unitAmount + l.taxAmount
}

export function GuestInvoiceMobileCard({
  document,
  businessName,
  isPaid,
  pdfUrl,
}: {
  document: SalesInvoiceRow
  businessName: string
  isPaid: boolean
  pdfUrl: string | null
}) {
  const lines = [...document.lines].sort((a, b) => a.sortOrder - b.sortOrder)
  const sub = lines.reduce((s, l) => s + l.quantity * l.unitAmount, 0)
  const total = lines.reduce((s, l) => s + lineAmount(l), 0)
  const currency = document.currency
  const status = document.status.toUpperCase()

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 px-5 pb-6 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <EasypayLogoMark className="h-8 w-auto max-w-[160px] object-contain brightness-0 invert" />
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isPaid
                ? 'bg-emerald-400/20 text-emerald-100'
                : status === 'APPROVED'
                  ? 'bg-teal-400/20 text-teal-100'
                  : 'bg-white/10 text-slate-200'
            }`}
          >
            {isPaid ? 'Paid' : status}
          </span>
        </div>
        <p className="mt-5 text-sm font-medium text-teal-100/90">{businessName}</p>
        <p className="mt-1 font-mono text-xs tracking-wide text-slate-300">{document.publicCode}</p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Amount due
        </p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {formatMoney(total, { decimals: 2 })}{' '}
          <span className="text-lg font-medium text-slate-300">{currency}</span>
        </p>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Issued</p>
            <p className="mt-1 font-medium text-slate-900">{formatDocDate(document.issueDate)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Due</p>
            <p className="mt-1 font-medium text-slate-900">{formatDocDate(document.dueDate)}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-1.5 text-base font-semibold text-slate-900">{document.contact.name}</p>
          {document.contact.email ? (
            <p className="mt-0.5 text-sm text-slate-600">{document.contact.email}</p>
          ) : null}
          {document.reference ? (
            <p className="mt-1 text-xs text-slate-500">Ref {document.reference}</p>
          ) : null}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Items
          </p>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-100">
            {lines.map((l) => (
              <li key={l.id} className="px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{l.narration || 'Item'}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {l.quantity}
                      {l.unitLabel ? ` ${l.unitLabel}` : ''} × {formatMoney(l.unitAmount, { decimals: 2 })}
                      {l.taxAmount > 0 ? ` · tax ${formatMoney(l.taxAmount, { decimals: 2 })}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 tabular-nums text-sm font-semibold text-slate-900">
                    {formatMoney(lineAmount(l), { decimals: 2 })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span className="tabular-nums font-medium text-slate-900">
              {formatMoney(sub, { decimals: 2 })} {currency}
            </span>
          </div>
          <div className="flex justify-between text-base font-semibold text-slate-900">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(total, { decimals: 2 })} {currency}
            </span>
          </div>
        </div>

        {pdfUrl ? (
          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm"
          >
            <FileDown className="h-4 w-4 text-teal-600" />
            Download PDF
          </a>
        ) : null}
      </div>
    </article>
  )
}
