import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'react-qr-code'
import { Check, Copy, ExternalLink, FileDown, Loader2, X } from 'lucide-react'

import { EasypayLogoMark } from '../components/branding/EasypayLogoMark'
import { CenteredModal } from '../components/ui/CenteredModal'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import {
  authorizeGuestSubscriptionInvoiceApsCheckout,
  completeGuestSubscriptionInvoiceApsCheckout,
  fetchGuestSubscriptionInvoice,
  fetchGuestSubscriptionInvoiceWallets,
  guestSubscriptionInvoicePdfApiUrl,
  startGuestSubscriptionInvoiceWalletCheckout,
  type OrderCheckoutWalletRow,
} from '../services/salesApi'
import { ApiError } from '../services/subscriptionApi'
import { checkoutWalletBrandImageSrc } from '../utils/checkoutWalletBrandImage'
import { formatMoney } from '../utils/formatMoney'

function fmtLongDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { dateStyle: 'long' })
  } catch {
    return iso
  }
}

function humanSubscriptionStatus(status: string) {
  return status.replace(/_/g, ' ')
}

function formatGmd(amount: string) {
  const n = Number(amount)
  if (Number.isNaN(n)) {
    return amount
  }
  return `D${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatCheckoutAmount(amount: number, currency: string) {
  const c = currency.toUpperCase()
  if (c === 'GMD') {
    return formatGmd(String(amount))
  }
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`
}

const DEFAULT_YONNA_PHONE_PREFIX = '+220'

const ADAPTER_ORDER: Record<string, number> = {
  wave_gambia: 0,
  yonna_wallet: 1,
  aps_wallet: 2,
}

function sortWallets(rows: OrderCheckoutWalletRow[]): OrderCheckoutWalletRow[] {
  return [...rows].sort(
    (a, b) =>
      (ADAPTER_ORDER[a.checkoutAdapter] ?? 99) - (ADAPTER_ORDER[b.checkoutAdapter] ?? 99),
  )
}

type HostedGuestCheckoutModalState = {
  launchUrl: string
  paymentHtml?: string | null
  amount: number
  currency: string
  gatewayName: string
}

export function GuestSubscriptionInvoicePage() {
  const { guestToken } = useParams<{ guestToken: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<Awaited<ReturnType<typeof fetchGuestSubscriptionInvoice>> | null>(
    null,
  )

  const [payModalOpen, setPayModalOpen] = useState(false)
  const [wallets, setWallets] = useState<OrderCheckoutWalletRow[]>([])
  const [walletsLoading, setWalletsLoading] = useState(false)
  const [selectedGatewayCode, setSelectedGatewayCode] = useState<string | null>(null)
  const [yonnaPayerPhone, setYonnaPayerPhone] = useState(DEFAULT_YONNA_PHONE_PREFIX)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [hostedCheckoutModal, setHostedCheckoutModal] = useState<HostedGuestCheckoutModalState | null>(
    null,
  )
  const [checkoutLinkCopied, setCheckoutLinkCopied] = useState(false)
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

  useEffect(() => {
    if (!payModalOpen) {
      return
    }
    const g = wallets.find((w) => w.code === selectedGatewayCode)
    if (g?.checkoutAdapter === 'aps_wallet') {
      setYonnaPayerPhone('')
    } else if (g?.checkoutAdapter === 'yonna_wallet') {
      setYonnaPayerPhone((prev) => (prev.trim() === '' ? DEFAULT_YONNA_PHONE_PREFIX : prev))
    }
  }, [payModalOpen, selectedGatewayCode, wallets])

  useEffect(() => {
    if (!hostedCheckoutModal || !guestToken) {
      return
    }
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const data = await fetchGuestSubscriptionInvoice(guestToken)
          if (data.invoice.status === 'PAID') {
            window.clearInterval(t)
            setHostedCheckoutModal(null)
            await load()
          }
        } catch {
          /* ignore */
        }
      })()
    }, 2000)
    return () => window.clearInterval(t)
  }, [hostedCheckoutModal, guestToken, load])

  useEffect(() => {
    setCheckoutLinkCopied(false)
  }, [hostedCheckoutModal?.gatewayName])

  const selectedWallet = useMemo(
    () => wallets.find((w) => w.code === selectedGatewayCode) ?? null,
    [wallets, selectedGatewayCode],
  )

  const needsPhoneForWallet =
    selectedWallet?.checkoutAdapter === 'yonna_wallet' ||
    selectedWallet?.checkoutAdapter === 'aps_wallet'

  const walletPhoneOk = useMemo(() => {
    if (!needsPhoneForWallet) {
      return true
    }
    const d = yonnaPayerPhone.replace(/\s/g, '')
    if (selectedWallet?.checkoutAdapter === 'aps_wallet') {
      return d.length >= 6
    }
    if (selectedWallet?.checkoutAdapter === 'yonna_wallet') {
      return d.length >= 8
    }
    return d.length >= 8
  }, [needsPhoneForWallet, selectedWallet?.checkoutAdapter, yonnaPayerPhone])

  const openPayModal = async () => {
    if (!guestToken) return
    setPayModalOpen(true)
    setWalletsLoading(true)
    setError(null)
    setHostedCheckoutModal(null)
    setApsAuthState(null)
    setApsOtp('')
    setYonnaPayerPhone(DEFAULT_YONNA_PHONE_PREFIX)
    try {
      const list = sortWallets(await fetchGuestSubscriptionInvoiceWallets(guestToken))
      setWallets(list)
      setSelectedGatewayCode(list[0]?.code ?? null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load payment options.')
      setPayModalOpen(false)
    } finally {
      setWalletsLoading(false)
    }
  }

  const handleProceedPay = async () => {
    if (!guestToken || !selectedWallet) return

    if (selectedWallet.checkoutAdapter === 'aps_wallet') {
      if (!apsAuthState) {
        if (!yonnaPayerPhone.trim()) {
          setError('Enter the APS mobile number to receive the OTP.')
          return
        }
        setCheckoutBusy(true)
        setError(null)
        try {
          const { authState, requiresOtp } = await authorizeGuestSubscriptionInvoiceApsCheckout(guestToken, {
            gatewayCode: selectedWallet.code,
            payerMobile: yonnaPayerPhone.trim(),
          })
          if (!requiresOtp) {
            await completeGuestSubscriptionInvoiceApsCheckout(guestToken, {
              gatewayCode: selectedWallet.code,
              authState,
            })
            setPayModalOpen(false)
            setApsAuthState(null)
            setApsOtp('')
            setYonnaPayerPhone(DEFAULT_YONNA_PHONE_PREFIX)
            await load()
          } else {
            setApsAuthState(authState)
          }
        } catch (e) {
          setError(e instanceof ApiError ? e.message : 'Could not start APS payment.')
        } finally {
          setCheckoutBusy(false)
        }
        return
      }
      if (apsOtp.trim().length < 4) {
        setError('Enter the OTP from your SMS.')
        return
      }
      setCheckoutBusy(true)
      setError(null)
      try {
        await completeGuestSubscriptionInvoiceApsCheckout(guestToken, {
          gatewayCode: selectedWallet.code,
          otp: apsOtp.trim(),
          authState: apsAuthState,
        })
        setPayModalOpen(false)
        setApsAuthState(null)
        setApsOtp('')
        setYonnaPayerPhone(DEFAULT_YONNA_PHONE_PREFIX)
        await load()
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not complete APS payment.')
      } finally {
        setCheckoutBusy(false)
      }
      return
    }

    if (selectedWallet.checkoutAdapter === 'yonna_wallet' && !yonnaPayerPhone.trim()) {
      setError('Enter the wallet phone number to pay.')
      return
    }

    setCheckoutBusy(true)
    setError(null)
    try {
      const body: { gatewayCode: string; payerPhone?: string } = {
        gatewayCode: selectedWallet.code,
      }
      if (selectedWallet.checkoutAdapter === 'yonna_wallet') {
        body.payerPhone = yonnaPayerPhone.trim()
      }
      const data = await startGuestSubscriptionInvoiceWalletCheckout(guestToken, body)
      setPayModalOpen(false)
      setApsAuthState(null)
      setApsOtp('')
      setYonnaPayerPhone(DEFAULT_YONNA_PHONE_PREFIX)
      setHostedCheckoutModal({
        launchUrl: data.launchUrl ?? '',
        paymentHtml: data.paymentHtml,
        amount: data.amount,
        currency: data.currency,
        gatewayName: selectedWallet.name,
      })
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
  const biz = payload.business
  const isPaid = inv.status === 'PAID'
  const isPending = inv.status === 'PENDING'
  const lineTitle = `${inv.planName} — subscription billing (${inv.planCode})`
  const lineSub = `Billing window ${fmtLongDate(inv.billingPeriodStart)} to ${fmtLongDate(inv.billingPeriodEnd)}`
  const amountStr = `${formatMoney(inv.amount)} ${inv.currency}`

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-8">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-6 sm:p-10">
            <div className="mb-8 flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-start sm:justify-between">
              <EasypayLogoMark className="h-10 w-auto max-w-[min(100%,260px)] object-contain" />
              {guestToken ? (
                <button
                  type="button"
                  onClick={() =>
                    window.open(guestSubscriptionInvoicePdfApiUrl(guestToken), '_blank', 'noopener,noreferrer')
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:self-center"
                >
                  <FileDown className="h-4 w-4 text-teal-600" aria-hidden />
                  Export PDF
                </button>
              ) : null}
            </div>

            <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h1 className="text-[26px] font-bold leading-tight text-slate-900">Invoice</h1>
              </div>
              <div className="sm:text-right">
                <p className="text-[10px] font-normal uppercase tracking-wide text-slate-600">Status</p>
                <p className="mt-1 text-base font-bold text-slate-800">{inv.status}</p>
                <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-slate-900">Issue date</p>
                <p className="mt-1 text-sm text-slate-600">{fmtLongDate(inv.createdAt)}</p>
                <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-900">Due date</p>
                <p className="mt-1 text-sm text-slate-600">{fmtLongDate(inv.dueDate)}</p>
              </div>
            </div>

            <hr className="my-7 border-slate-200" />

            <div className="grid gap-10 sm:grid-cols-2 sm:gap-6">
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Bill to</p>
                <p className="mt-3 text-sm font-bold text-slate-900">{payload.businessName}</p>
                <p className="mt-2 text-[11px] text-slate-800">{biz.ownerName}</p>
                <p className="mt-1 text-[11px] text-slate-800">{biz.ownerEmail}</p>
                {biz.industry ? (
                  <p className="mt-3 text-[8px] text-slate-500">Industry: {biz.industry}</p>
                ) : null}
                <p className="mt-2 font-mono text-[8px] text-slate-400">Ref: {biz.slug}</p>
              </div>
              <div>
                <p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Subscription</p>
                <p className="mt-3 text-sm font-bold text-slate-900">{inv.planName}</p>
                <p className="mt-2 text-[10px] leading-snug text-slate-600">{inv.planDescription}</p>
                <p className="mt-4 text-[8px] text-slate-500">
                  Subscription status: {humanSubscriptionStatus(inv.subscriptionStatus)}
                </p>
                <p className="mt-2 text-[8px] text-slate-500">
                  Service period: {fmtLongDate(inv.billingPeriodStart)} — {fmtLongDate(inv.billingPeriodEnd)}
                </p>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-[10px] border border-slate-100 bg-slate-50">
              <div className="grid grid-cols-[1fr_auto] gap-x-2 border-b border-slate-200 px-4 py-3 sm:px-4">
                <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500">Description</span>
                <span className="text-[8px] font-bold uppercase tracking-wide text-slate-500 sm:min-w-[7rem] sm:text-right">
                  Amount
                </span>
              </div>
              <div className="px-4 py-4 sm:px-4">
                <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
                  <div>
                    <p className="text-[10px] font-bold text-slate-800">{lineTitle}</p>
                    <p className="mt-1 text-[8px] text-slate-500">{lineSub}</p>
                  </div>
                  <p className="text-right text-[11px] font-bold text-slate-900 sm:min-w-[7rem]">{amountStr}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-200 pt-5">
              <div className="ml-auto max-w-[220px] space-y-3 text-sm">
                <div className="flex justify-between gap-6 text-slate-600">
                  <span>Subtotal</span>
                  <span>{amountStr}</span>
                </div>
                <div className="flex justify-between gap-6 text-base font-bold text-slate-900">
                  <span>Total due</span>
                  <span>{amountStr}</span>
                </div>
                {inv.paidAt ? (
                  <p className="pt-1 text-right text-sm font-medium text-emerald-700">
                    Paid on {fmtLongDate(inv.paidAt)}
                  </p>
                ) : null}
              </div>
            </div>

            {inv.externalReference ? (
              <p className="mt-8 text-center font-mono text-xs text-slate-500">
                Reference: {inv.externalReference}
              </p>
            ) : null}

            {!isPaid && isPending && payload.canPay ? (
              <div className="mt-10 border-t border-slate-200 pt-8">
                <p className="text-sm text-slate-600">Pay securely online below.</p>
                <button
                  type="button"
                  onClick={() => void openPayModal()}
                  className="mt-5 w-full rounded-xl bg-teal-600 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-500 sm:w-auto"
                >
                  Pay invoice
                </button>
              </div>
            ) : null}
          </div>
        </article>

        {isPaid ? (
          <p className="text-center font-medium text-emerald-700">This invoice is paid. Thank you.</p>
        ) : null}
      </div>

      {payModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => !checkoutBusy && setPayModalOpen(false)}
          />
          <CenteredModal className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl">
            <div className="relative p-6">
              <button
                type="button"
                onClick={() => !checkoutBusy && setPayModalOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
              <h2 className="pr-10 text-xl font-bold text-slate-900">Pay invoice</h2>
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{amountStr}</span>
                <span className="text-slate-400"> · </span>
                Due {fmtLongDate(inv.dueDate)}
              </p>
              <p className="mt-4 text-sm text-slate-600">Choose a wallet to pay.</p>

              {walletsLoading ? (
                <div className="mt-6 flex justify-center py-8 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : wallets.length === 0 ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  No platform checkout providers are available (enable gateways in the database and set
                  WAVE_CHECKOUT_BEARER, YONNA_FOREX_* and/or APS_WALLET_* in the server environment).
                </div>
              ) : (
                <div className="mt-4 grid gap-3">
                  {wallets.map((w) => {
                    const selected = selectedGatewayCode === w.code
                    const brandImg = checkoutWalletBrandImageSrc(w.checkoutAdapter)
                    return (
                      <button
                        key={w.code}
                        type="button"
                        onClick={() => setSelectedGatewayCode(w.code)}
                        aria-pressed={selected}
                        className={[
                          'w-full rounded-2xl border-2 p-4 text-left transition',
                          selected
                            ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/30'
                            : 'border-slate-200 bg-white hover:border-slate-300',
                        ].join(' ')}
                      >
                        <span className="flex items-start gap-3">
                          {brandImg ? (
                            <div className="relative shrink-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm">
                              <img
                                src={brandImg}
                                alt=""
                                className="h-12 w-12 object-contain p-1"
                                aria-hidden
                              />
                            </div>
                          ) : (
                            <div
                              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-[11px] font-bold uppercase leading-none tracking-wide text-slate-500"
                              aria-hidden
                            >
                              {w.code.replace(/_/g, '').slice(0, 2)}
                            </div>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-slate-900">{w.name}</span>
                            <span className="mt-1 block text-xs font-medium text-teal-800">
                              Platform checkout (env credentials)
                            </span>
                            <span className="mt-1 block font-mono text-xs text-slate-500">{w.code}</span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {needsPhoneForWallet && wallets.length > 0 ? (
                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {selectedWallet?.checkoutAdapter === 'aps_wallet' ? 'APS mobile number' : 'Yonna wallet phone'}
                  </label>
                  <input
                    type="tel"
                    autoComplete="tel"
                    placeholder={
                      selectedWallet?.checkoutAdapter === 'aps_wallet' ? 'e.g. 2XXXXXXX' : 'e.g. +2207XXXXXXX'
                    }
                    value={yonnaPayerPhone}
                    onChange={(e) => setYonnaPayerPhone(e.target.value)}
                    disabled={Boolean(selectedWallet?.checkoutAdapter === 'aps_wallet' && apsAuthState)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500 focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedWallet?.checkoutAdapter === 'aps_wallet'
                      ? 'The APS wallet number that will receive the SMS code. Enter the local number only (do not use +220).'
                      : 'The number registered on the Yonna wallet that will pay this invoice.'}
                  </p>
                </div>
              ) : null}

              {selectedWallet?.checkoutAdapter === 'aps_wallet' && apsAuthState ? (
                <div className="mt-4">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    OTP from SMS
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter the code"
                    value={apsOtp}
                    onChange={(e) => setApsOtp(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500 focus:ring-2"
                  />
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setPayModalOpen(false)}
                  disabled={checkoutBusy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={(() => {
                    if (checkoutBusy || wallets.length === 0 || !selectedWallet) {
                      return true
                    }
                    if (selectedWallet.checkoutAdapter === 'aps_wallet') {
                      if (apsAuthState) {
                        return apsOtp.trim().length < 4
                      }
                      return !walletPhoneOk
                    }
                    if (selectedWallet.checkoutAdapter === 'yonna_wallet') {
                      return !walletPhoneOk
                    }
                    return false
                  })()}
                  onClick={() => void handleProceedPay()}
                  className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {checkoutBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {selectedWallet?.checkoutAdapter === 'aps_wallet' && !apsAuthState
                        ? 'Sending…'
                        : selectedWallet?.checkoutAdapter === 'aps_wallet'
                          ? 'Paying…'
                          : 'Starting…'}
                    </span>
                  ) : selectedWallet?.checkoutAdapter === 'aps_wallet' && !apsAuthState ? (
                    'Send OTP'
                  ) : selectedWallet?.checkoutAdapter === 'aps_wallet' && apsAuthState ? (
                    'Pay now'
                  ) : (
                    'Proceed to pay'
                  )}
                </button>
              </div>
            </div>
          </CenteredModal>
        </div>
      ) : null}

      {hostedCheckoutModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4">
          <ModalOverlay
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setHostedCheckoutModal(null)}
          />
          <CenteredModal
            className={`relative z-10 w-full overflow-hidden rounded-2xl bg-white shadow-2xl ${
              hostedCheckoutModal.paymentHtml ? 'max-w-xl' : 'max-w-md'
            }`}
          >
            <div
              className={`relative flex max-h-[92vh] flex-col overflow-y-auto ${
                hostedCheckoutModal.paymentHtml ? 'p-5 sm:p-6' : 'items-center p-8 text-center'
              }`}
            >
              <button
                type="button"
                onClick={() => setHostedCheckoutModal(null)}
                className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:right-4 sm:top-4"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>

              {hostedCheckoutModal.paymentHtml ? (
                <>
                  <div className="mb-4 w-full pr-10 text-center sm:pr-12">
                    <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">
                      Pay with {hostedCheckoutModal.gatewayName}
                    </h2>
                  </div>
                  <div className="mb-4 w-full rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/90 to-white px-4 py-3 text-center shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800/70">
                      Amount due
                    </p>
                    <p className="text-2xl font-bold text-teal-700">
                      {formatCheckoutAmount(hostedCheckoutModal.amount, hostedCheckoutModal.currency)}
                    </p>
                  </div>
                  <p className="mb-3 text-center text-sm leading-relaxed text-slate-600">
                    Use the checkout below. Leave this window open—we check automatically when payment succeeds.
                  </p>
                  <div className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/[0.06]">
                    <div className="flex items-center gap-2.5 border-b border-slate-200/80 bg-white px-4 py-2.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
                        aria-hidden
                      />
                      <span className="text-xs font-semibold text-slate-700">{hostedCheckoutModal.gatewayName}</span>
                      <span className="ml-auto text-[11px] font-medium text-slate-400">Secure checkout</span>
                    </div>
                    <iframe
                      title="Wallet checkout"
                      className="block h-[min(640px,70vh)] min-h-[440px] w-full border-0 bg-white"
                      sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                      srcDoc={hostedCheckoutModal.paymentHtml ?? ''}
                    />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="mb-1 text-2xl font-bold text-slate-900">
                    Pay with {hostedCheckoutModal.gatewayName}
                  </h2>
                  <p className="mb-6 max-w-sm text-sm text-slate-500">
                    {hostedCheckoutModal.launchUrl
                      ? 'Scan the QR with your wallet app, or use the payment link below. This page checks automatically when payment succeeds.'
                      : 'Follow your wallet instructions. This page checks automatically when payment succeeds.'}
                  </p>
                  {hostedCheckoutModal.launchUrl ? (
                    <div className="relative mb-6 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
                      <div className="bg-white p-2">
                        <QRCode value={hostedCheckoutModal.launchUrl} size={220} level="M" />
                      </div>
                    </div>
                  ) : null}
                  {hostedCheckoutModal.launchUrl ? (
                    <div className="mb-6 w-full text-left">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Payment link</p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                        <input
                          readOnly
                          value={hostedCheckoutModal.launchUrl}
                          onFocus={(e) => e.currentTarget.select()}
                          onClick={(e) => e.currentTarget.select()}
                          className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 outline-none ring-teal-500 focus:ring-2"
                          aria-label="Payment URL"
                        />
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void (async () => {
                                try {
                                  await navigator.clipboard.writeText(hostedCheckoutModal.launchUrl)
                                  setCheckoutLinkCopied(true)
                                  window.setTimeout(() => setCheckoutLinkCopied(false), 2000)
                                } catch {
                                  setError('Could not copy link. Select the field and copy manually.')
                                }
                              })()
                            }}
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 sm:flex-none"
                          >
                            {checkoutLinkCopied ? (
                              <>
                                <Check className="h-4 w-4 text-emerald-600" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4" />
                                Copy
                              </>
                            )}
                          </button>
                          <a
                            href={hostedCheckoutModal.launchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 sm:flex-none"
                          >
                            <ExternalLink className="h-4 w-4" />
                            Open
                          </a>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div className="mb-6 w-full rounded-xl bg-slate-50 p-4">
                    <p className="mb-1 text-sm text-slate-500">Amount due</p>
                    <p className="text-2xl font-bold text-teal-600">
                      {formatCheckoutAmount(hostedCheckoutModal.amount, hostedCheckoutModal.currency)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </CenteredModal>
        </div>
      ) : null}
    </div>
  )
}
