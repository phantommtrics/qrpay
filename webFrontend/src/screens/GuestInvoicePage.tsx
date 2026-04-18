import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'react-qr-code'

import { SalesDocumentPaper } from '../components/sales/SalesDocumentPaper'
import {
  authorizeGuestInvoiceApsWalletCheckout,
  completeGuestInvoiceApsWalletCheckout,
  fetchGuestInvoice,
  fetchGuestInvoiceWallets,
  startGuestInvoiceWalletCheckout,
  type OrderCheckoutWalletRow,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { checkoutWalletBrandImageSrc } from '../utils/checkoutWalletBrandImage'
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
  const [qrPayload, setQrPayload] = useState<string | null>(null)
  const [paymentHtml, setPaymentHtml] = useState<string | null>(null)
  const [checkoutAdapter, setCheckoutAdapter] = useState<string | null>(null)
  const [payPublicToken, setPayPublicToken] = useState<string | null>(null)
  const [apsAuthState, setApsAuthState] = useState<string | null>(null)
  const [apsOtp, setApsOtp] = useState('')

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
    setQrPayload(null)
    setPaymentHtml(null)
    setCheckoutAdapter(null)
    setPayPublicToken(null)
    setApsAuthState(null)
    setApsOtp('')
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

    if (sel.checkoutAdapter === 'aps_wallet') {
      if (!apsAuthState) {
        const digits = payerPhone.replace(/\D/g, '')
        if (digits.length < 6) {
          setError('Enter a valid APS mobile number (at least 6 digits; local number only).')
          return
        }
        setCheckoutBusy(true)
        setError(null)
        try {
          const { authState, requiresOtp } = await authorizeGuestInvoiceApsWalletCheckout(guestToken, {
            gatewayCode: selectedGatewayCode,
            payerMobile: payerPhone.trim(),
          })
          setCheckoutAdapter('aps_wallet')
          if (!requiresOtp) {
            await completeGuestInvoiceApsWalletCheckout(guestToken, {
              gatewayCode: selectedGatewayCode,
              authState,
            })
            setPayOpen(false)
            setApsAuthState(null)
            setApsOtp('')
            setLaunchUrl(null)
            setQrPayload(null)
            setPaymentHtml(null)
            setCheckoutAdapter(null)
            setPayPublicToken(null)
            await load()
          } else {
            setApsAuthState(authState)
          }
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not send OTP.')
        } finally {
          setCheckoutBusy(false)
        }
        return
      }
      if (apsOtp.trim().length < 4) {
        setError('Enter the SMS verification code.')
        return
      }
      setCheckoutBusy(true)
      setError(null)
      try {
        await completeGuestInvoiceApsWalletCheckout(guestToken, {
          gatewayCode: selectedGatewayCode,
          otp: apsOtp.trim(),
          authState: apsAuthState,
        })
        setPayOpen(false)
        setApsAuthState(null)
        setApsOtp('')
        setLaunchUrl(null)
        setQrPayload(null)
        setPaymentHtml(null)
        setCheckoutAdapter(null)
        setPayPublicToken(null)
        await load()
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Payment failed.')
      } finally {
        setCheckoutBusy(false)
      }
      return
    }

    if (sel.checkoutAdapter === 'yonna_wallet' && !payerPhone.trim()) {
      setError('Enter the wallet phone number to pay.')
      return
    }
    setCheckoutBusy(true)
    setError(null)
    try {
      const body: { gatewayCode: string; payerPhone?: string } = {
        gatewayCode: selectedGatewayCode,
      }
      if (sel.checkoutAdapter === 'yonna_wallet') {
        body.payerPhone = payerPhone.trim()
      }
      const r = await startGuestInvoiceWalletCheckout(guestToken, body)
      setCheckoutAdapter(r.checkoutAdapter)
      setPaymentHtml(r.paymentHtml)
      setPayPublicToken(r.payment.publicToken)
      const url = r.launchUrl?.trim() ? r.launchUrl.trim() : null
      setLaunchUrl(url)
      setQrPayload(r.qrPayload?.trim() ? r.qrPayload.trim() : null)
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
                <div className="mx-auto grid max-w-md gap-2">
                  {wallets.map((w) => {
                    const brandImg = checkoutWalletBrandImageSrc(w.checkoutAdapter)
                    const selected = selectedGatewayCode === w.code
                    return (
                      <button
                        key={w.code}
                        type="button"
                        onClick={() => {
                          setSelectedGatewayCode(w.code)
                          setApsAuthState(null)
                          setApsOtp('')
                        }}
                        aria-pressed={selected}
                        className={[
                          'flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left text-sm transition',
                          selected
                            ? 'border-teal-600 bg-teal-50 text-teal-950 ring-2 ring-teal-500/25'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50/80',
                        ].join(' ')}
                      >
                        {brandImg ? (
                          <div className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
                            <img
                              src={brandImg}
                              alt=""
                              className="h-10 w-10 object-contain p-0.5"
                              aria-hidden
                            />
                          </div>
                        ) : (
                          <div
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"
                            aria-hidden
                          >
                            {w.code.replace(/_/g, '').slice(0, 2)}
                          </div>
                        )}
                        <span className="min-w-0 flex-1 font-semibold">{w.name}</span>
                      </button>
                    )
                  })}
                </div>
                {selectedGatewayCode &&
                wallets.find((x) => x.code === selectedGatewayCode)?.checkoutAdapter === 'yonna_wallet' ? (
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
                {selectedGatewayCode &&
                wallets.find((x) => x.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">APS mobile number</span>
                    <input
                      type="tel"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      disabled={Boolean(apsAuthState)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-50"
                      placeholder="Local number (no +220)"
                      autoComplete="tel"
                    />
                  </label>
                ) : null}
                {selectedGatewayCode &&
                wallets.find((x) => x.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' &&
                apsAuthState ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">SMS code</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={apsOtp}
                      onChange={(e) => setApsOtp(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Enter the code from SMS"
                      autoComplete="one-time-code"
                    />
                  </label>
                ) : null}
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPayOpen(false)
                      setLaunchUrl(null)
                      setQrPayload(null)
                      setPaymentHtml(null)
                      setCheckoutAdapter(null)
                      setPayPublicToken(null)
                      setApsAuthState(null)
                      setApsOtp('')
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={(() => {
                      const gate = wallets.find((x) => x.code === selectedGatewayCode)
                      if (!selectedGatewayCode || checkoutBusy) return true
                      if (gate?.checkoutAdapter === 'aps_wallet') {
                        if (!apsAuthState) {
                          return payerPhone.replace(/\D/g, '').length < 6
                        }
                        return apsOtp.trim().length < 4
                      }
                      return Boolean(payPublicToken)
                    })()}
                    onClick={() => void startCheckout()}
                    className="rounded-xl bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    {checkoutBusy
                      ? 'Starting…'
                      : (() => {
                          const gate = wallets.find((x) => x.code === selectedGatewayCode)
                          if (gate?.checkoutAdapter === 'aps_wallet' && !apsAuthState) return 'Send OTP'
                          if (gate?.checkoutAdapter === 'aps_wallet' && apsAuthState) {
                            return 'Complete payment'
                          }
                          return payPublicToken ? 'Checkout started' : 'Continue'
                        })()}
                  </button>
                </div>
                {payPublicToken ? (
                  <div className="space-y-4 border-t border-slate-100 pt-4">
                    <p className="text-center text-sm text-slate-700">
                      Complete payment in your wallet. Stay on this page — scan the QR or open the link on your phone.
                    </p>
                    {paymentHtml && checkoutAdapter === 'yonna_wallet' ? (
                      <iframe
                        title="Wallet checkout"
                        className="mx-auto h-[min(420px,50vh)] w-full max-w-md rounded-lg border border-slate-200 bg-white"
                        srcDoc={paymentHtml}
                        sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                      />
                    ) : null}
                    {qrPayload && !(paymentHtml && checkoutAdapter === 'yonna_wallet') ? (
                      <div className="flex flex-col items-center gap-3">
                        <div className="flex justify-center rounded-lg bg-white p-2">
                          <QRCode value={qrPayload} size={200} level="M" />
                        </div>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard.writeText(qrPayload)}
                          className="text-sm font-medium text-teal-700 hover:underline"
                        >
                          Copy payment link
                        </button>
                      </div>
                    ) : null}
                    {launchUrl && checkoutAdapter !== 'simulator' ? (
                      <a
                        href={launchUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-center text-sm font-medium text-teal-700 hover:underline"
                      >
                        Open payment page in new tab
                      </a>
                    ) : null}
                    {checkoutAdapter === 'simulator' && payPublicToken ? (
                      <p className="text-center text-sm text-slate-600">
                        Demo: complete payment on the{' '}
                        <Link
                          to={`/pay/${encodeURIComponent(payPublicToken)}`}
                          className="font-medium text-teal-700 underline"
                        >
                          public pay page
                        </Link>
                        .
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
