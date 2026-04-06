import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { SalesDocumentPaper } from '../components/sales/SalesDocumentPaper'
import {
  fetchGuestInvoice,
  fetchGuestInvoiceWallets,
  startGuestInvoiceWalletCheckout,
  type OrderCheckoutWalletRow,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function GuestInvoicePage() {
  const { guestToken } = useParams<{ guestToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchGuestInvoice>> | null>(null)

  const [payOpen, setPayOpen] = useState(false)
  const [wallets, setWallets] = useState<OrderCheckoutWalletRow[]>([])
  const [walletsLoading, setWalletsLoading] = useState(false)
  const [selectedGatewayCode, setSelectedGatewayCode] = useState<string | null>(null)
  const [payerPhone, setPayerPhone] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [launchUrl, setLaunchUrl] = useState<string | null>(null)
  const [paymentHtml, setPaymentHtml] = useState<string | null>(null)
  const [checkoutAdapter, setCheckoutAdapter] = useState<string | null>(null)
  const [payPublicToken, setPayPublicToken] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!guestToken) {
      setError('Invalid link.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchGuestInvoice(guestToken)
      setPayload(data)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load invoice.')
    } finally {
      setLoading(false)
    }
  }, [guestToken])

  useEffect(() => {
    void load()
  }, [load])

  const openPay = async () => {
    if (!guestToken) return
    setPayOpen(true)
    setWalletsLoading(true)
    setError(null)
    setLaunchUrl(null)
    setPaymentHtml(null)
    setCheckoutAdapter(null)
    setPayPublicToken(null)
    try {
      const list = await fetchGuestInvoiceWallets(guestToken)
      setWallets(list)
      const first = list[0]?.code ?? null
      setSelectedGatewayCode(first)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load payment options.')
      setPayOpen(false)
    } finally {
      setWalletsLoading(false)
    }
  }

  const startCheckout = async () => {
    if (!guestToken || !selectedGatewayCode) return
    const sel = wallets.find((w) => w.code === selectedGatewayCode)
    if (!sel) return
    if (sel.checkoutAdapter === 'yonna_wallet' && !payerPhone.trim() && !sel.hasStoredPayerPhone) {
      setError('Enter the wallet phone number to pay.')
      return
    }
    setCheckoutBusy(true)
    setError(null)
    try {
      const body: { gatewayCode: string; payerPhone?: string } = {
        gatewayCode: selectedGatewayCode,
      }
      if (sel.checkoutAdapter === 'yonna_wallet' && payerPhone.trim()) {
        body.payerPhone = payerPhone.trim()
      }
      const r = await startGuestInvoiceWalletCheckout(guestToken, body)
      setCheckoutAdapter(r.checkoutAdapter)
      setPaymentHtml(r.paymentHtml)
      setPayPublicToken(r.payment.publicToken)
      const url = r.launchUrl?.trim() ? r.launchUrl.trim() : null
      setLaunchUrl(url)
      if (url && (r.checkoutAdapter !== 'yonna_wallet' || !r.paymentHtml)) {
        window.location.href = url
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start payment.')
    } finally {
      setCheckoutBusy(false)
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

  const doc = payload.document
  const total = doc.lines.reduce(
    (s, l) => s + l.quantity * l.unitAmount + l.taxAmount,
    0,
  )
  const isPaid = doc.status === 'paid'

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <header className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">{payload.businessName}</h1>
          <p className="mt-1 text-sm text-slate-500">Invoice</p>
        </header>

        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

        {isPaid ? (
          <p className="text-center font-medium text-emerald-700">This invoice is paid. Thank you.</p>
        ) : null}

        <SalesDocumentPaper variant="invoice" document={doc} businessName={payload.businessName} />

        {!isPaid && payload.canPay ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!payOpen ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-slate-600">
                  Amount due:{' '}
                  <span className="font-semibold text-slate-900">
                    {formatMoney(total)} {doc.currency}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void openPay()}
                  className="mt-2 rounded-xl bg-teal-600 px-8 py-3 font-semibold text-white hover:bg-teal-700"
                >
                  Pay
                </button>
              </div>
            ) : walletsLoading ? (
              <p className="text-center text-sm text-slate-600">Loading payment options…</p>
            ) : wallets.length === 0 ? (
              <p className="text-center text-sm text-slate-600">
                Online wallet payment is not available for this business yet.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-center text-sm font-medium text-slate-800">Pay with wallet</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {wallets.map((w) => (
                    <button
                      key={w.code}
                      type="button"
                      onClick={() => setSelectedGatewayCode(w.code)}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium ${
                        selectedGatewayCode === w.code
                          ? 'border-teal-600 bg-teal-50 text-teal-900'
                          : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
                {selectedGatewayCode &&
                wallets.find((x) => x.code === selectedGatewayCode)?.checkoutAdapter === 'yonna_wallet' &&
                !wallets.find((x) => x.code === selectedGatewayCode)?.hasStoredPayerPhone ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">Wallet phone</span>
                    <input
                      type="tel"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="+220 …"
                      autoComplete="tel"
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPayOpen(false)
                      setLaunchUrl(null)
                      setPaymentHtml(null)
                      setCheckoutAdapter(null)
                      setPayPublicToken(null)
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={checkoutBusy || !selectedGatewayCode}
                    onClick={() => void startCheckout()}
                    className="rounded-xl bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    {checkoutBusy ? 'Starting…' : 'Continue'}
                  </button>
                </div>
                {paymentHtml && checkoutAdapter === 'yonna_wallet' ? (
                  <iframe title="Wallet checkout" className="h-[420px] w-full rounded-lg border" srcDoc={paymentHtml} />
                ) : null}
                {launchUrl && checkoutAdapter !== 'yonna_wallet' && checkoutAdapter !== 'simulator' ? (
                  <p className="text-center text-sm text-slate-600">
                    If you were not redirected,{' '}
                    <a href={launchUrl} className="font-medium text-teal-700 underline">
                      open the wallet payment page
                    </a>
                    .
                  </p>
                ) : null}
                {checkoutAdapter === 'simulator' && payPublicToken ? (
                  <p className="text-center text-sm text-slate-600">
                    Demo: complete payment on the{' '}
                    <Link to={`/pay/${encodeURIComponent(payPublicToken)}`} className="font-medium text-teal-700 underline">
                      public pay page
                    </Link>
                    .
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
