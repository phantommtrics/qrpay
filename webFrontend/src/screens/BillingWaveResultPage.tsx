import { useMemo } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'

function useQueryInvoiceId() {
  const { search } = useLocation()
  return useMemo(() => new URLSearchParams(search).get('invoiceId'), [search])
}

export function BillingWaveSuccessPage() {
  const invoiceId = useQueryInvoiceId()

  return (
    <PageTransition className="space-y-6" withSlide>
      <PageCard className="p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Payment submitted</h1>
        <p className="mt-2 text-slate-600">
          If you completed payment in Wave, your subscription will update shortly after we receive
          the webhook.
          {invoiceId ? (
            <>
              {' '}
              Invoice reference: <span className="font-mono text-sm">{invoiceId}</span>
            </>
          ) : null}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to={APP_PATHS.billing}
            className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
          >
            Back to billing
          </Link>
          <Link
            to={APP_PATHS.dashboard}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </div>
      </PageCard>
    </PageTransition>
  )
}

export function BillingWaveCancelPage() {
  const invoiceId = useQueryInvoiceId()

  return (
    <PageTransition className="space-y-6" withSlide>
      <PageCard className="p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <XCircle className="h-8 w-8" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Checkout cancelled</h1>
        <p className="mt-2 text-slate-600">
          No charge was made. You can try again from Billing whenever you are ready.
          {invoiceId ? (
            <>
              {' '}
              Invoice: <span className="font-mono text-sm">{invoiceId}</span>
            </>
          ) : null}
        </p>
        <Link
          to={APP_PATHS.billing}
          className="mt-8 inline-block rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Return to billing
        </Link>
      </PageCard>
    </PageTransition>
  )
}
