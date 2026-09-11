import { FileDown } from 'lucide-react'

import { EasypayLogoMark } from '../branding/EasypayLogoMark'
import { formatMoney } from '../../utils/formatMoney'

function formatDocDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function GuestSubscriptionInvoiceMobileCard({
  businessName,
  ownerName,
  ownerEmail,
  invoiceCode,
  status,
  isPaid,
  amount,
  currency,
  issueDate,
  dueDate,
  planName,
  lineTitle,
  lineSub,
  pdfUrl,
}: {
  businessName: string
  ownerName: string
  ownerEmail: string
  invoiceCode: string
  status: string
  isPaid: boolean
  amount: number
  currency: string
  issueDate: string
  dueDate: string
  planName: string
  lineTitle: string
  lineSub: string
  pdfUrl: string | null
}) {
  const amountLabel = `${formatMoney(amount)} ${currency}`

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(15,23,42,0.08)]">
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 px-5 pb-6 pt-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <EasypayLogoMark className="h-8 w-auto max-w-[160px] object-contain brightness-0 invert" />
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isPaid ? 'bg-emerald-400/20 text-emerald-100' : 'bg-teal-400/20 text-teal-100'
            }`}
          >
            {isPaid ? 'Paid' : status}
          </span>
        </div>
        <p className="mt-5 text-sm font-medium text-teal-100/90">{businessName}</p>
        <p className="mt-1 font-mono text-xs tracking-wide text-slate-300">{invoiceCode}</p>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          Amount due
        </p>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {formatMoney(amount)} <span className="text-lg font-medium text-slate-300">{currency}</span>
        </p>
      </div>

      <div className="space-y-5 px-5 py-5">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Issued</p>
            <p className="mt-1 font-medium text-slate-900">{formatDocDate(issueDate)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Due</p>
            <p className="mt-1 font-medium text-slate-900">{formatDocDate(dueDate)}</p>
          </div>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bill to</p>
          <p className="mt-1.5 text-base font-semibold text-slate-900">{businessName}</p>
          <p className="mt-0.5 text-sm text-slate-600">{ownerName}</p>
          <p className="text-sm text-slate-600">{ownerEmail}</p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Plan</p>
          <p className="mt-1.5 font-semibold text-slate-900">{planName}</p>
          <div className="mt-3 rounded-2xl border border-slate-100 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{lineTitle}</p>
                <p className="mt-0.5 text-xs text-slate-500">{lineSub}</p>
              </div>
              <p className="shrink-0 tabular-nums text-sm font-semibold text-slate-900">
                {amountLabel}
              </p>
            </div>
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
