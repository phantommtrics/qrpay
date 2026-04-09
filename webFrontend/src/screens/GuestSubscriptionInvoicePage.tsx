import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

import { EasypayLogoMark } from '../components/branding/EasypayLogoMark'
import {
  authorizeGuestSubscriptionInvoiceApsCheckout,
  completeGuestSubscriptionInvoiceApsCheckout,
  fetchGuestSubscriptionInvoice,
  fetchGuestSubscriptionInvoiceWallets,
  startGuestSubscriptionInvoiceWalletCheckout,
  type OrderCheckoutWalletRow,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { formatMoney } from '../utils/formatMoney'

export function GuestSubscriptionInvoicePage() {
  const { guestToken } = useParams<{ guestToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchGuestSubscriptionInvoice>> | null>(
    null,
  )

  const [payOpen, setPayOpen] = useState(false)
  const [wallets, setWallets] = useState<OrderCheckoutWalletRow[]>([])
  const [walletsLoading, setWalletsLoading] = useState(false)
  const [selectedGatewayCode, setSelectedGatewayCode] = useState<string | null>(null)
  const [payerPhone, setPayerPhone] = useState('')
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [launchUrl, setLaunchUrl] = useState<string | null>(null)
  const [paymentHtml, setPaymentHtml] = useState<string | null>(null)
  const [checkoutAdapter, setCheckoutAdapter] = useState<string | null>(null)
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
      const data = await fetchGuestSubscriptionInvoice(guestToken)
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

  useEffect(() => {
    setApsAuthState(null)
    setApsOtp('')
  }, [selectedGatewayCode])

  const openPay = async () => {
    if (!guestToken) return
    setPayOpen(true)
    setWalletsLoading(true)
    setError(null)
    setLaunchUrl(null)
    setPaymentHtml(null)
    setCheckoutAdapter(null)
    setApsAuthState(null)
    setApsOtp('')
    try {
      const list = await fetchGuestSubscriptionInvoiceWallets(guestToken)
      setWallets(list)
      setSelectedGatewayCode(list[0]?.code ?? null)
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
    if (sel.checkoutAdapter === 'aps_wallet' && !payerPhone.trim()) {
      setError('Enter the APS mobile number to receive the OTP.')
      return
    }
    if (sel.checkoutAdapter === 'aps_wallet' && apsAuthState && apsOtp.trim().length < 4) {
      setError('Enter the OTP from your SMS.')
      return
    }
    setCheckoutBusy(true)
    setError(null)
    try {
      if (sel.checkoutAdapter === 'aps_wallet') {
        if (!apsAuthState) {
          const { authState } = await authorizeGuestSubscriptionInvoiceApsCheckout(guestToken, {
            gatewayCode: selectedGatewayCode,
            payerMobile: payerPhone.trim(),
          })
          setApsAuthState(authState)
          setCheckoutAdapter('aps_wallet')
          return
        }
        await completeGuestSubscriptionInvoiceApsCheckout(guestToken, {
          gatewayCode: selectedGatewayCode,
          otp: apsOtp.trim(),
          authState: apsAuthState,
        })
        setPayOpen(false)
        setApsAuthState(null)
        setApsOtp('')
        setPayerPhone('')
        await load()
        return
      }

      const body: { gatewayCode: string; payerPhone?: string } = {
        gatewayCode: selectedGatewayCode,
      }
      if (sel.checkoutAdapter === 'yonna_wallet' && payerPhone.trim()) {
        body.payerPhone = payerPhone.trim()
      }
      const r = await startGuestSubscriptionInvoiceWalletCheckout(guestToken, body)
      setCheckoutAdapter(sel.checkoutAdapter ?? null)
      setPaymentHtml(r.paymentHtml)
      const url = r.launchUrl?.trim() ? r.launchUrl.trim() : null
      setLaunchUrl(url)
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

  const inv = payload.invoice
  const isPaid = inv.status === 'PAID'
  const isPending = inv.status === 'PENDING'

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex max-w-lg flex-col gap-6">
        <header className="flex flex-col items-center text-center">
          <EasypayLogoMark className="mb-4 h-10 w-auto max-w-[min(100%,260px)] object-contain" />
          <h1 className="text-lg font-semibold text-slate-900">{payload.businessName}</h1>
          <p className="mt-1 text-sm text-slate-500">Subscription invoice</p>
        </header>

        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Plan</dt>
              <dd className="font-medium text-slate-900">{inv.planName}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-semibold text-slate-900">
                {formatMoney(inv.amount)} {inv.currency}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Due</dt>
              <dd className="text-slate-800">{new Date(inv.dueDate).toLocaleDateString()}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Status</dt>
              <dd className="text-slate-800">{inv.status}</dd>
            </div>
            {inv.externalReference ? (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Reference</dt>
                <dd className="font-mono text-xs text-slate-700">{inv.externalReference}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {isPaid ? (
          <p className="text-center font-medium text-emerald-700">This invoice is paid. Thank you.</p>
        ) : null}

        {!isPaid && isPending && payload.canPay ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            {!payOpen ? (
              <div className="flex flex-col items-center gap-2">
                <p className="text-sm text-slate-600">
                  Pay online with a supported wallet (same options as in-app billing).
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
                Online payment is not available for this business yet.
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
                {selectedGatewayCode &&
                wallets.find((x) => x.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">APS mobile number</span>
                    <input
                      type="tel"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="2XXXXXXX"
                      autoComplete="tel"
                      disabled={Boolean(apsAuthState)}
                    />
                  </label>
                ) : null}
                {selectedGatewayCode &&
                wallets.find((x) => x.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' &&
                apsAuthState ? (
                  <label className="block text-sm">
                    <span className="text-slate-600">OTP from SMS</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={apsOtp}
                      onChange={(e) => setApsOtp(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                      placeholder="Enter the code"
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
                      setPaymentHtml(null)
                      setCheckoutAdapter(null)
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
                      const gate = wallets.find((w) => w.code === selectedGatewayCode)
                      const isAps = gate?.checkoutAdapter === 'aps_wallet'
                      if (checkoutBusy || !selectedGatewayCode) {
                        return true
                      }
                      if (isAps) {
                        if (!apsAuthState) {
                          return !payerPhone.trim()
                        }
                        return apsOtp.trim().length < 4
                      }
                      return Boolean(launchUrl || paymentHtml)
                    })()}
                    onClick={() => void startCheckout()}
                    className="rounded-xl bg-teal-600 px-6 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    {checkoutBusy
                      ? wallets.find((w) => w.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' &&
                          !apsAuthState
                        ? 'Sending…'
                        : wallets.find((w) => w.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet'
                          ? 'Paying…'
                          : 'Starting…'
                      : wallets.find((w) => w.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' &&
                          !apsAuthState
                        ? 'Send OTP'
                        : wallets.find((w) => w.code === selectedGatewayCode)?.checkoutAdapter === 'aps_wallet' &&
                            apsAuthState
                          ? 'Pay now'
                          : launchUrl || paymentHtml
                            ? 'Started'
                            : 'Continue'}
                  </button>
                </div>
                {paymentHtml && checkoutAdapter === 'yonna_wallet' ? (
                  <iframe
                    title="Wallet checkout"
                    className="mx-auto h-[min(420px,50vh)] w-full max-w-md rounded-lg border border-slate-200 bg-white"
                    srcDoc={paymentHtml}
                    sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
                  />
                ) : null}
                {launchUrl &&
                checkoutAdapter !== 'yonna_wallet' &&
                checkoutAdapter !== 'aps_wallet' ? (
                  <a
                    href={launchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center text-sm font-medium text-teal-700 hover:underline"
                  >
                    Open payment page in new tab
                  </a>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
