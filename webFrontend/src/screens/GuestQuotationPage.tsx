import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { SalesDocumentPaper } from '../components/sales/SalesDocumentPaper'
import { fetchGuestQuotation, respondGuestQuotation } from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'

export function GuestQuotationPage() {
  const { guestToken } = useParams<{ guestToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchGuestQuotation>> | null>(null)

  const load = useCallback(async () => {
    if (!guestToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGuestQuotation(guestToken)
      setPayload(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load quotation.')
    } finally {
      setLoading(false)
    }
  }, [guestToken])

  useEffect(() => {
    void load()
  }, [load])

  const respond = async (action: 'accept' | 'reject') => {
    if (!guestToken) return
    setBusy(true)
    setError(null)
    try {
      const data = await respondGuestQuotation(guestToken, action)
      setPayload(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update quotation.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <p className="text-slate-600">Loading…</p>
      </div>
    )
  }

  if (error && !payload) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 p-6">
        <p className="text-center text-red-600">{error}</p>
      </div>
    )
  }

  if (!payload) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">{payload.businessName}</h1>
          <p className="mt-1 text-sm text-slate-500">Quotation</p>
        </header>

        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

        {payload.createdInvoice ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-900">
            <p className="font-medium">Quotation accepted.</p>
            <p className="mt-1">
              A draft invoice has been created:{' '}
              <span className="font-mono font-semibold">{payload.createdInvoice.publicCode}</span>
            </p>
          </div>
        ) : null}

        {!payload.canRespond && payload.document.status === 'rejected' ? (
          <p className="text-center text-sm text-slate-600">This quotation was declined.</p>
        ) : null}

        {!payload.canRespond && payload.document.status === 'accepted' && !payload.createdInvoice ? (
          <p className="text-center text-sm text-slate-600">This quotation was accepted.</p>
        ) : null}

        <SalesDocumentPaper variant="quotation" document={payload.document} businessName={payload.businessName} />

        {payload.canRespond ? (
          <div className="flex flex-wrap justify-center gap-3 pb-8">
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond('reject')}
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {busy ? '…' : 'Reject'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void respond('accept')}
              className="rounded-xl bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {busy ? '…' : 'Accept'}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
