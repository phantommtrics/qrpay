import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowDownUp,
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react'
import QRCode from 'react-qr-code'

import { CenteredModal } from '../components/ui/CenteredModal'
import { ModalOverlay } from '../components/ui/ModalOverlay'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'
import {
  addBusinessPaymentMethodRequest,
  ApiError,
  archiveBusinessPaymentMethodRequest,
  changeBusinessSubscriptionPlan,
  createSubscription,
  fetchBusinessPaymentGateways,
  fetchBusinessPaymentMethods,
  fetchBusinessSubscription,
  fetchPlansRaw,
  paySubscriptionInvoice,
  authorizeSubscriptionInvoiceApsCheckout,
  completeSubscriptionInvoiceApsCheckout,
  startSubscriptionInvoiceCheckout,
  type BackendInvoice,
  type BackendPlanCode,
  type BackendSubscription,
  type BusinessPaymentGatewayRow,
  type BusinessPaymentMethodRow,
  type CorporateBillingSnapshot,
} from '../services/subscriptionApi'
import type { PlanId, SubscriptionBillingInterval } from '../types'
import { checkoutWalletBrandImageSrc } from '../utils/checkoutWalletBrandImage'

function formatGmd(amount: string) {
  const n = Number(amount)
  if (Number.isNaN(n)) {
    return amount
  }
  return `D${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function planIdFromCode(code: BackendPlanCode): PlanId {
  switch (code) {
    case 'BASIC':
      return 'basic'
    case 'PRO':
      return 'pro'
    case 'BUSINESS_PRO':
      return 'business_pro'
    case 'CORPORATE':
      return 'corporate'
  }
}

const PLAN_OPTIONS: BackendPlanCode[] = ['BASIC', 'PRO', 'BUSINESS_PRO']

const CORPORATE_BILLING_INTERVALS: SubscriptionBillingInterval[] = [
  'MONTHLY',
  'QUARTERLY',
  'HALF_YEARLY',
  'YEARLY',
  'TWO_YEARS',
  'CONTRACT_INFINITE',
]

function formatBillingIntervalLabel(iv: SubscriptionBillingInterval): string {
  const map: Record<SubscriptionBillingInterval, string> = {
    MONTHLY: 'Monthly',
    QUARTERLY: 'Quarterly',
    HALF_YEARLY: 'Half-yearly',
    YEARLY: 'Yearly',
    TWO_YEARS: 'Two years',
    CONTRACT_INFINITE: 'Signed contract (perpetual)',
  }
  return map[iv] ?? iv
}

function intervalPriceField(
  iv: SubscriptionBillingInterval,
): keyof NonNullable<CorporateBillingSnapshot['prices']> {
  switch (iv) {
    case 'MONTHLY':
      return 'monthly'
    case 'QUARTERLY':
      return 'quarterly'
    case 'HALF_YEARLY':
      return 'halfYearly'
    case 'YEARLY':
      return 'yearly'
    case 'TWO_YEARS':
      return 'twoYears'
    case 'CONTRACT_INFINITE':
      return 'contract'
    default:
      return 'monthly'
  }
}

function parseMoneyToNumber(formatted: string): number | null {
  const n = Number(String(formatted).replace(/[^\d.-]+/g, ''))
  return Number.isFinite(n) ? n : null
}

const DEFAULT_YONNA_PHONE_PREFIX = '+220'

type HostedCheckoutModalState = {
  launchUrl: string
  paymentHtml?: string
  amount: number
  currency: string
  invoiceId: string
  gatewayName: string
  paymentMethodLabel?: string
}

type PayInvoicePickerState = {
  invoiceId: string
}

function formatCheckoutAmount(amount: number, currency: string) {
  const c = currency.toUpperCase()
  if (c === 'GMD') {
    return formatGmd(String(amount))
  }
  return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`
}

export function BillingPage() {
  const { currentOrganization, user, refreshBusinessSubscriptionSnapshot } = useAuth()
  const businessId = currentOrganization?.id ?? null
  const isOwner = Boolean(currentOrganization?.isOwner)

  const [subscription, setSubscription] = useState<BackendSubscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [gateways, setGateways] = useState<BusinessPaymentGatewayRow[]>([])
  const [methods, setMethods] = useState<BusinessPaymentMethodRow[]>([])
  const [planCatalog, setPlanCatalog] = useState<
    Array<{ code: BackendPlanCode; name: string; monthlyPrice: string; yearlyPrice: string }>
  >([])
  const [newLabel, setNewLabel] = useState('')
  const [selectedGatewayCode, setSelectedGatewayCode] = useState('')
  const [checkoutLoadingKey, setCheckoutLoadingKey] = useState<string | null>(null)
  const [renewLoading, setRenewLoading] = useState(false)
  const [planChangeLoading, setPlanChangeLoading] = useState(false)
  const [startPlanId, setStartPlanId] = useState<PlanId>('basic')
  const [targetPlanCode, setTargetPlanCode] = useState<BackendPlanCode>('BASIC')
  const [targetBillingInterval, setTargetBillingInterval] =
    useState<SubscriptionBillingInterval>('MONTHLY')
  const [hostedCheckoutModal, setHostedCheckoutModal] = useState<HostedCheckoutModalState | null>(
    null,
  )
  const [yonnaPayerPhone, setYonnaPayerPhone] = useState(DEFAULT_YONNA_PHONE_PREFIX)
  const [payInvoicePicker, setPayInvoicePicker] = useState<PayInvoicePickerState | null>(null)
  const [selectedPayMethodId, setSelectedPayMethodId] = useState<string | null>(null)
  const [checkoutPaidBanner, setCheckoutPaidBanner] = useState(false)
  const [checkoutLinkCopied, setCheckoutLinkCopied] = useState(false)
  const [planChangeGuestUrl, setPlanChangeGuestUrl] = useState<string | null>(null)
  const [planChangeGuestUrlCopied, setPlanChangeGuestUrlCopied] = useState(false)
  const [devSubscriptionInvoicePayAllowed, setDevSubscriptionInvoicePayAllowed] = useState(false)
  const [apsAuthState, setApsAuthState] = useState<string | null>(null)
  const [apsOtp, setApsOtp] = useState('')
  const [corporateBilling, setCorporateBilling] = useState<CorporateBillingSnapshot | null>(null)

  const gatewaysWithCheckout = useMemo(
    () => gateways.filter((g) => Boolean(g.checkoutAdapter)),
    [gateways],
  )

  const checkoutGatewayCodeSet = useMemo(
    () => new Set(gatewaysWithCheckout.map((g) => g.code)),
    [gatewaysWithCheckout],
  )

  const methodsEligibleForInvoicePay = useMemo(
    () =>
      methods.filter(
        (m) => m.status === 'ACTIVE' && checkoutGatewayCodeSet.has(m.gateway.code),
      ),
    [methods, checkoutGatewayCodeSet],
  )

  const gatewayCodesWithPaymentMethod = useMemo(
    () => new Set(methods.map((m) => m.gateway.code)),
    [methods],
  )

  const load = useCallback(async (options?: { silent?: boolean }) => {
    if (!businessId) {
      setLoading(false)
      return
    }
    const silent = Boolean(options?.silent)
    if (!silent) {
      setLoading(true)
    }
    setError(null)
    try {
      const [subEnv, gw, pm, plans] = await Promise.all([
        fetchBusinessSubscription(businessId),
        fetchBusinessPaymentGateways(businessId),
        fetchBusinessPaymentMethods(businessId),
        fetchPlansRaw(),
      ])
      setSubscription(subEnv.currentSubscription)
      setCorporateBilling(subEnv.corporateBilling ?? null)
      setDevSubscriptionInvoicePayAllowed(Boolean(subEnv.devSubscriptionInvoicePayAllowed))
      setGateways(gw)
      setMethods(pm)
      setPlanCatalog(
        plans.map((p) => ({
          code: p.code,
          name: p.name,
          monthlyPrice: p.monthlyPrice,
          yearlyPrice: p.yearlyPrice ?? p.monthlyPrice,
        })),
      )
    } catch (e) {
      if (!silent) {
        setError(e instanceof ApiError ? e.message : 'Could not load billing.')
      }
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [businessId])

  useEffect(() => {
    void load()
  }, [load])

  const selectedPayMethodCheckoutAdapter = useMemo(() => {
    if (!selectedPayMethodId) {
      return null
    }
    const m = methods.find((x) => x.id === selectedPayMethodId)
    if (!m) {
      return null
    }
    return gateways.find((g) => g.code === m.gateway.code)?.checkoutAdapter ?? null
  }, [selectedPayMethodId, methods, gateways])

  const needsPhoneForSubscriptionWallet =
    selectedPayMethodCheckoutAdapter === 'yonna_wallet' ||
    selectedPayMethodCheckoutAdapter === 'aps_wallet'
  /** Yonna expects longer intl-style numbers; APS local numbers are often 7 digits (no +220), so do not use 8 for APS. */
  const walletPhoneOk = (() => {
    if (!needsPhoneForSubscriptionWallet) {
      return true
    }
    const d = yonnaPayerPhone.replace(/\s/g, '')
    if (selectedPayMethodCheckoutAdapter === 'aps_wallet') {
      return d.length >= 6
    }
    if (selectedPayMethodCheckoutAdapter === 'yonna_wallet') {
      return d.length >= 8
    }
    return d.length >= 8
  })()

  useEffect(() => {
    setCheckoutLinkCopied(false)
  }, [hostedCheckoutModal?.invoiceId])

  useEffect(() => {
    if (!payInvoicePicker) {
      setApsAuthState(null)
      setApsOtp('')
    }
  }, [payInvoicePicker])

  useEffect(() => {
    if (!payInvoicePicker) {
      return
    }
    if (selectedPayMethodCheckoutAdapter === 'aps_wallet') {
      setYonnaPayerPhone('')
    } else if (selectedPayMethodCheckoutAdapter === 'yonna_wallet') {
      setYonnaPayerPhone((prev) => (prev.trim() === '' ? DEFAULT_YONNA_PHONE_PREFIX : prev))
    }
  }, [payInvoicePicker, selectedPayMethodCheckoutAdapter])

  useEffect(() => {
    setApsAuthState(null)
    setApsOtp('')
  }, [selectedPayMethodId])

  useEffect(() => {
    if (!payInvoicePicker) {
      setSelectedPayMethodId(null)
      return
    }
    setSelectedPayMethodId((prev) => {
      if (prev && methodsEligibleForInvoicePay.some((m) => m.id === prev)) {
        return prev
      }
      return methodsEligibleForInvoicePay[0]?.id ?? null
    })
  }, [payInvoicePicker, methodsEligibleForInvoicePay])

  useEffect(() => {
    if (gateways.length === 0) {
      return
    }
    const selectedOk =
      Boolean(selectedGatewayCode) &&
      gateways.some((g) => g.code === selectedGatewayCode) &&
      !gatewayCodesWithPaymentMethod.has(selectedGatewayCode)
    if (!selectedOk) {
      const next = gateways.find((g) => !gatewayCodesWithPaymentMethod.has(g.code))
      if (next) {
        setSelectedGatewayCode(next.code)
        setNewLabel((prev) => (prev.trim() === '' ? next.name : prev))
      } else {
        setSelectedGatewayCode('')
      }
    }
  }, [gateways, selectedGatewayCode, gatewayCodesWithPaymentMethod])

  useEffect(() => {
    const g = gateways.find((x) => x.code === selectedGatewayCode)
    if (g && newLabel.trim() === '') {
      setNewLabel(g.name)
    }
  }, [selectedGatewayCode, gateways, newLabel])

  useEffect(() => {
    if (!subscription) {
      return
    }
    setTargetPlanCode(subscription.plan.code)
    setTargetBillingInterval(subscription.billingInterval ?? 'MONTHLY')
  }, [subscription?.id, subscription?.plan?.code, subscription?.billingInterval])

  const isCorporateProgram = Boolean(corporateBilling)

  const pendingInvoices: BackendInvoice[] =
    subscription?.invoices?.filter((i) => i.status === 'PENDING') ?? []

  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!hostedCheckoutModal || !businessId) {
      return
    }
    const invoiceId = hostedCheckoutModal.invoiceId
    const t = window.setInterval(() => {
      void (async () => {
        try {
          const env = await fetchBusinessSubscription(businessId)
          const inv = env.currentSubscription?.invoices?.find((i) => i.id === invoiceId)
          if (inv?.status === 'PAID') {
            window.clearInterval(t)
            setHostedCheckoutModal(null)
            setCheckoutPaidBanner(true)
            await loadRef.current({ silent: true })
            await refreshBusinessSubscriptionSnapshot(businessId)
          }
        } catch {
          /* ignore transient poll errors */
        }
      })()
    }, 2000)
    return () => window.clearInterval(t)
  }, [hostedCheckoutModal, businessId, refreshBusinessSubscriptionSnapshot])

  const startCheckoutForMethod = async (
    invoiceId: string,
    gatewayCode: string,
    gatewayName: string,
    paymentMethodLabel?: string,
    payerPhone?: string,
  ) => {
    if (!businessId) {
      return
    }
    setCheckoutLoadingKey(`pay:${invoiceId}`)
    setError(null)
    try {
      const data = await startSubscriptionInvoiceCheckout(businessId, invoiceId, {
        gatewayCode,
        ...(payerPhone?.trim() ? { payerPhone: payerPhone.trim() } : {}),
      })
      setPayInvoicePicker(null)
      setHostedCheckoutModal({
        launchUrl: data.launchUrl ?? '',
        paymentHtml: data.paymentHtml,
        amount: data.amount,
        currency: data.currency,
        invoiceId,
        gatewayName,
        paymentMethodLabel,
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.')
    } finally {
      setCheckoutLoadingKey(null)
    }
  }

  const handleProceedPayInvoice = async () => {
    if (!businessId || !payInvoicePicker || !selectedPayMethodId) {
      return
    }
    const method = methods.find((m) => m.id === selectedPayMethodId)
    if (!method || !checkoutGatewayCodeSet.has(method.gateway.code)) {
      return
    }
    const adapter =
      gateways.find((g) => g.code === method.gateway.code)?.checkoutAdapter ?? null

    if (adapter === 'aps_wallet') {
      setCheckoutLoadingKey(`pay:${payInvoicePicker.invoiceId}`)
      setError(null)
      try {
        if (!apsAuthState) {
          const { authState, requiresOtp } = await authorizeSubscriptionInvoiceApsCheckout(
            businessId,
            payInvoicePicker.invoiceId,
            {
              gatewayCode: method.gateway.code,
              payerMobile: yonnaPayerPhone.trim(),
            },
          )
          if (!requiresOtp) {
            await completeSubscriptionInvoiceApsCheckout(businessId, payInvoicePicker.invoiceId, {
              gatewayCode: method.gateway.code,
              authState,
            })
            setPayInvoicePicker(null)
            setApsAuthState(null)
            setApsOtp('')
            setCheckoutPaidBanner(true)
            await load({ silent: true })
            await refreshBusinessSubscriptionSnapshot(businessId)
          } else {
            setApsAuthState(authState)
          }
          return
        }
        await completeSubscriptionInvoiceApsCheckout(businessId, payInvoicePicker.invoiceId, {
          gatewayCode: method.gateway.code,
          otp: apsOtp.trim(),
          authState: apsAuthState,
        })
        setPayInvoicePicker(null)
        setApsAuthState(null)
        setApsOtp('')
        setCheckoutPaidBanner(true)
        await load({ silent: true })
        await refreshBusinessSubscriptionSnapshot(businessId)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not complete APS Wallet payment.')
      } finally {
        setCheckoutLoadingKey(null)
      }
      return
    }

    await startCheckoutForMethod(
      payInvoicePicker.invoiceId,
      method.gateway.code,
      method.gateway.name,
      method.label,
      selectedPayMethodCheckoutAdapter === 'yonna_wallet' ? yonnaPayerPhone : undefined,
    )
  }

  const handleSimulatePay = async (invoiceId: string) => {
    if (!businessId) {
      return
    }
    setCheckoutLoadingKey(`sim:${invoiceId}`)
    setError(null)
    try {
      await paySubscriptionInvoice(businessId, invoiceId)
      await load({ silent: true })
      await refreshBusinessSubscriptionSnapshot(businessId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not mark invoice paid.')
    } finally {
      setCheckoutLoadingKey(null)
    }
  }

  const handleAddMethod = async () => {
    if (!businessId || !selectedGatewayCode || gatewayCodesWithPaymentMethod.has(selectedGatewayCode)) {
      return
    }
    setError(null)
    try {
      await addBusinessPaymentMethodRequest(businessId, {
        gatewayCode: selectedGatewayCode,
        label: newLabel.trim() || 'Payment method',
        isDefault: methods.length === 0,
      })
      setNewLabel('')
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not add payment method.')
    }
  }

  const handleRemoveMethod = async (methodId: string) => {
    if (!businessId) {
      return
    }
    setError(null)
    try {
      await archiveBusinessPaymentMethodRequest(businessId, methodId)
      await load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not remove payment method.')
    }
  }

  const handleStartSubscription = async () => {
    if (!businessId) {
      return
    }
    setRenewLoading(true)
    setError(null)
    try {
      await createSubscription(businessId, startPlanId)
      await load()
      await refreshBusinessSubscriptionSnapshot(businessId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start subscription.')
    } finally {
      setRenewLoading(false)
    }
  }

  const handleChangePlan = async () => {
    if (!businessId || !subscription) {
      return
    }
    if (isCorporateProgram) {
      const p = corporateBilling?.prices
      if (p) {
        const f = intervalPriceField(targetBillingInterval)
        const n = parseMoneyToNumber(p[f])
        if (n == null || n <= 0) {
          setError('That billing cycle is not priced on your corporate template. Ask DirectPay to set it.')
          return
        }
      }
    }
    setPlanChangeLoading(true)
    setError(null)
    try {
      const out = await changeBusinessSubscriptionPlan(businessId, {
        planCode: isCorporateProgram ? 'BUSINESS_PRO' : targetPlanCode,
        billingInterval: targetBillingInterval,
      })
      setPlanChangeGuestUrl(out.pendingInvoice?.guestPayUrl?.trim() || null)
      setPlanChangeGuestUrlCopied(false)
      await load()
      await refreshBusinessSubscriptionSnapshot(businessId)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not update plan.')
    } finally {
      setPlanChangeLoading(false)
    }
  }

  const planChangeDisabled =
    !subscription ||
    !isOwner ||
    (isCorporateProgram
      ? (subscription.billingInterval ?? 'MONTHLY') === targetBillingInterval
      : subscription.plan.code === targetPlanCode &&
        (subscription.billingInterval ?? 'MONTHLY') === targetBillingInterval)

  if (!businessId) {
    return (
      <PageTransition className="space-y-6" withSlide>
        <PageCard className="p-6">
          <p className="text-slate-600">Select a business to manage billing.</p>
        </PageCard>
      </PageTransition>
    )
  }

  return (
    <PageTransition className="space-y-6" withSlide>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">Billing</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            {currentOrganization?.name ?? 'Business'}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {planChangeGuestUrl ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-teal-200 bg-teal-50/90 px-4 py-3 text-sm text-teal-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">Plan updated — pay this invoice on the guest page</p>
            <p className="mt-1 text-teal-900/90">
              Share or open this link (no login) to view the invoice and pay online, same as the email we send to
              the business owner.
            </p>
            <a
              href={planChangeGuestUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-medium text-teal-800 underline decoration-teal-400 underline-offset-2 hover:text-teal-950"
            >
              Open guest pay page
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(planChangeGuestUrl)
                setPlanChangeGuestUrlCopied(true)
                window.setTimeout(() => setPlanChangeGuestUrlCopied(false), 2000)
              } catch {
                setPlanChangeGuestUrlCopied(false)
              }
            }}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-teal-300 bg-white px-4 py-2.5 text-sm font-semibold text-teal-900 shadow-sm hover:bg-teal-50"
          >
            <Copy className="h-4 w-4" />
            {planChangeGuestUrlCopied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      ) : null}

      {checkoutPaidBanner ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            Payment received. Your subscription has been updated.
          </span>
          <button
            type="button"
            onClick={() => setCheckoutPaidBanner(false)}
            className="shrink-0 rounded-lg p-1 text-emerald-800 hover:bg-emerald-100"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {loading ? (
        <PageCard className="flex items-center gap-3 p-6 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading billing…
        </PageCard>
      ) : null}

      {!loading && !subscription ? (
        <PageCard className="space-y-4 p-6">
          <h2 className="text-lg font-semibold text-slate-900">No active subscription</h2>
          <p className="text-sm text-slate-600">
            Start a plan to begin a trial and receive your first invoice. Only the business owner
            can start a subscription.
          </p>
          {isOwner ? (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">Plan</span>
                <select
                  value={startPlanId}
                  onChange={(e) => setStartPlanId(e.target.value as PlanId)}
                  className="mt-1 block rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
                >
                  {planCatalog.map((p) => (
                    <option key={p.code} value={planIdFromCode(p.code)}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={renewLoading}
                onClick={() => void handleStartSubscription()}
                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
              >
                {renewLoading ? 'Starting…' : 'Start subscription'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Ask the business owner to start a subscription.</p>
          )}
        </PageCard>
      ) : null}

      {!loading && subscription ? (
        <PageCard className="space-y-4 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Current plan</h2>
              <p className="mt-1 text-sm text-slate-600">
                {isCorporateProgram ? (
                  <>
                    <span className="font-medium text-slate-800">Corporate</span>
                    {' · '}
                    {subscription.plan.name} (catalog tier)
                    {subscription.billingInterval
                      ? ` · ${formatBillingIntervalLabel(subscription.billingInterval)} billing`
                      : ''}
                    {' · '}
                    {subscription.status.replace(/_/g, ' ')}
                  </>
                ) : (
                  <>
                    {subscription.plan.name} · {subscription.status.replace(/_/g, ' ')}
                    {subscription.billingInterval
                      ? ` · ${formatBillingIntervalLabel(subscription.billingInterval)} billing`
                      : ''}
                  </>
                )}
              </p>
              <p className="mt-2 text-sm text-slate-500">
                {subscription.contractPerpetual ||
                subscription.billingInterval === 'CONTRACT_INFINITE' ? (
                  <>Signed contract — no automatic renewal period in the app.</>
                ) : subscription.currentPeriodEnd ? (
                  <>Period ends {new Date(subscription.currentPeriodEnd).toLocaleString()}</>
                ) : (
                  <>No period end on file.</>
                )}
              </p>
            </div>
          </div>

          {subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED' ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
              <p className="font-semibold text-amber-950">Subscription ended</p>
              <p className="mt-1 text-amber-900/90">
                {pendingInvoices.length > 0
                  ? 'Pay the pending invoice below to restore your plan. We also email the business owner a guest pay link when a renewal invoice is issued.'
                  : 'Hang tight — we are preparing your renewal invoice. Refresh this page in a moment, or check the business owner inbox for an email with a pay link.'}
              </p>
            </div>
          ) : null}

          {subscription.status === 'ACTIVE' &&
          subscription.currentPeriodEnd &&
          (() => {
            const end = new Date(subscription.currentPeriodEnd).getTime()
            const days = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24))
            return days >= 0 && days <= 7
          })() ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-950">
              <p className="font-semibold text-teal-900">Renewal window</p>
              <p className="mt-1 text-teal-900/90">
                Your billing period is ending soon. When a renewal invoice is ready, it appears below
                and we email the owner — you can pay here without leaving DirectPay.
              </p>
            </div>
          ) : null}

          {isCorporateProgram && corporateBilling ? (
            <div className="rounded-2xl border border-teal-100 bg-teal-50/50 p-4">
              <h3 className="text-sm font-semibold text-teal-950">Corporate billing</h3>
              {corporateBilling.templateName ? (
                <p className="mt-1 text-sm text-slate-700">
                  Template: <span className="font-medium">{corporateBilling.templateName}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-amber-900">
                  No billing template is assigned yet. Subscription invoices stay at zero until DirectPay
                  configures your corporate template.
                </p>
              )}
              {corporateBilling.prices ? (
                <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {CORPORATE_BILLING_INTERVALS.map((iv) => {
                    const field = intervalPriceField(iv)
                    const label = corporateBilling.prices![field]
                    const amt = parseMoneyToNumber(label)
                    const active = subscription.billingInterval === iv
                    return (
                      <li
                        key={iv}
                        className={`flex justify-between gap-2 rounded-lg border px-3 py-2 ${
                          active ? 'border-teal-300 bg-white' : 'border-slate-100 bg-white/60'
                        }`}
                      >
                        <span>{formatBillingIntervalLabel(iv)}</span>
                        <span className="font-medium text-slate-900">
                          {amt != null && amt > 0 ? label : '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              <p className="mt-2 text-xs text-slate-600">
                Amounts are set by your operator. Changing your billing cycle issues a new invoice for
                that cadence (pending invoices are replaced).
              </p>
            </div>
          ) : null}

          {isOwner &&
          (subscription.status === 'TRIALING' ||
            subscription.status === 'ACTIVE' ||
            subscription.status === 'PAST_DUE' ||
            subscription.status === 'EXPIRED' ||
            subscription.status === 'CANCELLED') &&
          isCorporateProgram ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2 text-slate-800">
                <ArrowDownUp className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-semibold">Change billing cycle</h3>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Switch between monthly, quarterly, half-yearly, yearly, two-year, or signed contract
                billing. Your catalog tier stays on {subscription.plan.name}. A new invoice is issued
                for the selected cycle; any pending invoices are voided.
              </p>
              <div className="mx-auto mt-4 w-full max-w-lg space-y-2">
                {CORPORATE_BILLING_INTERVALS.map((iv) => {
                  const prices = corporateBilling?.prices
                  const field = intervalPriceField(iv)
                  const label = prices?.[field]
                  const amt = label ? parseMoneyToNumber(label) : null
                  const available = amt != null && amt > 0
                  const isSelected = targetBillingInterval === iv
                  return (
                    <button
                      key={iv}
                      type="button"
                      disabled={!available}
                      onClick={() => setTargetBillingInterval(iv)}
                      className={[
                        'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition',
                        !available
                          ? 'cursor-not-allowed border-slate-100 bg-slate-100/80 text-slate-400'
                          : isSelected
                            ? 'border-teal-500 bg-teal-50 ring-1 ring-teal-500/30'
                            : 'border-slate-200 bg-white hover:border-slate-300',
                      ].join(' ')}
                    >
                      <span className="font-medium">{formatBillingIntervalLabel(iv)}</span>
                      <span className="text-xs text-slate-600">
                        {available && label ? `${label} ${corporateBilling?.currency ?? 'GMD'}` : 'Not set'}
                      </span>
                    </button>
                  )
                })}
              </div>
              <div className="mx-auto mt-6 w-full max-w-lg">
                <button
                  type="button"
                  disabled={planChangeLoading || planChangeDisabled}
                  onClick={() => void handleChangePlan()}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {planChangeLoading ? 'Updating…' : 'Apply billing cycle'}
                </button>
              </div>
            </div>
          ) : null}

          {isOwner &&
          (subscription.status === 'TRIALING' ||
            subscription.status === 'ACTIVE' ||
            subscription.status === 'PAST_DUE' ||
            subscription.status === 'EXPIRED' ||
            subscription.status === 'CANCELLED') &&
          !isCorporateProgram ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2 text-slate-800">
                <ArrowDownUp className="h-4 w-4 text-teal-600" />
                <h3 className="text-sm font-semibold">Change plan</h3>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Upgrade or change plan anytime. You can also switch between monthly and yearly
                billing—pending invoices are voided and a new invoice is issued for the selected
                plan and cycle. Your current period end date stays the same until renewal.
              </p>

              <div className="mx-auto mt-5 w-full max-w-md space-y-3">
                <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                  Select a plan
                </p>
                {PLAN_OPTIONS.map((code) => {
                  const meta = planCatalog.find((p) => p.code === code)
                  const name = meta?.name ?? code
                  const isCurrent = subscription.plan.code === code
                  const isSelected = targetPlanCode === code
                  const effectiveBillingInterval = targetBillingInterval
                  const showYearly = effectiveBillingInterval === 'YEARLY'
                  const priceLine = meta
                    ? showYearly
                      ? `${formatGmd(meta.yearlyPrice)} / year`
                      : `${formatGmd(meta.monthlyPrice)} / month`
                    : ''

                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={isCurrent}
                      aria-pressed={!isCurrent && isSelected}
                      onClick={() => setTargetPlanCode(code)}
                      className={[
                        'relative w-full rounded-2xl border-2 p-4 text-left shadow-sm transition',
                        isCurrent
                          ? 'cursor-not-allowed border-emerald-200 bg-emerald-50/60'
                          : isSelected
                            ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/30'
                            : 'border-slate-200 bg-white hover:border-slate-300',
                      ].join(' ')}
                    >
                      {isCurrent ? (
                        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Current plan
                        </span>
                      ) : null}
                      <p className="pr-28 font-semibold text-slate-900">{name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{code}</p>
                      {priceLine ? (
                        <p className="mt-2 text-sm font-medium text-teal-800">{priceLine}</p>
                      ) : null}
                    </button>
                  )
                })}
              </div>

              <div className="mx-auto mt-5 w-full max-w-md">
                <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-500">
                  Billing cycle
                </p>
                <div className="mt-2 flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                  {(['MONTHLY', 'YEARLY'] as const).map((iv) => (
                    <button
                      key={iv}
                      type="button"
                      onClick={() => setTargetBillingInterval(iv)}
                      className={[
                        'flex-1 rounded-lg py-2.5 text-sm font-semibold transition',
                        targetBillingInterval === iv
                          ? 'bg-teal-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-50',
                      ].join(' ')}
                    >
                      {iv === 'YEARLY' ? 'Yearly' : 'Monthly'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mx-auto mt-6 w-full max-w-md">
                <button
                  type="button"
                  disabled={planChangeLoading || planChangeDisabled}
                  onClick={() => void handleChangePlan()}
                  className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {planChangeLoading ? 'Updating…' : 'Apply change'}
                </button>
              </div>
            </div>
          ) : null}

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Invoices</h3>
            {pendingInvoices.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No pending invoices.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pendingInvoices.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{formatGmd(inv.amount)}</p>
                      <p className="text-xs text-slate-500">
                        Due {new Date(inv.dueDate).toLocaleDateString()}
                      </p>
                    </div>
                    {isOwner ? (
                      <div className="flex flex-col gap-2 sm:items-end">
                        {gatewaysWithCheckout.length > 0 ? (
                          <button
                            type="button"
                            disabled={checkoutLoadingKey === `pay:${inv.id}`}
                            onClick={() => {
                              setError(null)
                              setPayInvoicePicker({ invoiceId: inv.id })
                            }}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-50"
                          >
                            {checkoutLoadingKey === `pay:${inv.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Pay invoice
                          </button>
                        ) : (
                          <p className="text-xs text-slate-500">
                            No gateways with online checkout are enabled. Your administrator can
                            enable providers under Platform → Payment gateways.
                          </p>
                        )}
                        {devSubscriptionInvoicePayAllowed ? (
                          <button
                            type="button"
                            disabled={checkoutLoadingKey === `sim:${inv.id}`}
                            onClick={() => void handleSimulatePay(inv.id)}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Dev: mark paid
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Only the owner can pay invoices.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PageCard>
      ) : null}

      <PageCard className="space-y-4 p-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-teal-600" />
          <h2 className="text-lg font-semibold text-slate-900">Payment methods</h2>
        </div>

        {gateways.length === 0 ? (
          <p className="text-sm text-amber-800">
            No payment gateways are enabled for your business yet. Your platform administrator can
            add and enable providers.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {isOwner ? 'Choose a gateway to add' : 'Available gateways'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {gateways.map((g) => {
                const alreadyAdded = gatewayCodesWithPaymentMethod.has(g.code)
                const isSelected =
                  isOwner && !alreadyAdded && selectedGatewayCode === g.code
                const brandImg = checkoutWalletBrandImageSrc(g.checkoutAdapter ?? '')
                const blockInner = (
                  <div className="flex items-start gap-3">
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
                        {g.code.replace(/_/g, '').slice(0, 2)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">{g.name}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">{g.code}</p>
                      {g.checkoutAdapter ? (
                        <p className="mt-2 text-xs font-medium text-teal-800">Online checkout available</p>
                      ) : null}
                      {alreadyAdded ? (
                        <p className="mt-3 text-xs font-semibold text-slate-500">Already added</p>
                      ) : null}
                    </div>
                  </div>
                )
                if (!isOwner) {
                  return (
                    <div
                      key={g.id}
                      className="rounded-2xl border border-slate-100 bg-white p-4 text-left shadow-sm"
                    >
                      {blockInner}
                    </div>
                  )
                }
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={alreadyAdded}
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (!alreadyAdded) {
                        setSelectedGatewayCode(g.code)
                      }
                    }}
                    className={[
                      'rounded-2xl border-2 p-4 text-left shadow-sm transition',
                      alreadyAdded
                        ? 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-500 opacity-75'
                        : isSelected
                          ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/30'
                          : 'border-slate-200 bg-white hover:border-slate-300',
                    ].join(' ')}
                  >
                    {blockInner}
                  </button>
                )
              })}
            </div>
            {isOwner ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="text-sm font-medium text-slate-800">Add payment method</p>
                {gateways.every((g) => gatewayCodesWithPaymentMethod.has(g.code)) ? (
                  <p className="mt-2 text-sm text-slate-600">
                    Every available gateway is already saved. Remove one below if you need to change
                    it.
                  </p>
                ) : (
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                    <label className="block min-w-[200px] flex-1 text-sm">
                      <span className="text-slate-600">Label</span>
                      <input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900"
                        placeholder="e.g. Main business wallet"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={
                        !selectedGatewayCode ||
                        gatewayCodesWithPaymentMethod.has(selectedGatewayCode)
                      }
                      onClick={() => void handleAddMethod()}
                      className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {methods.length > 0 ? (
          <ul className="space-y-2">
            {methods.map((m) => {
              const methodAdapter =
                gateways.find((x) => x.code === m.gateway.code)?.checkoutAdapter ?? ''
              const methodBrandImg = checkoutWalletBrandImageSrc(methodAdapter)
              return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {methodBrandImg ? (
                    <div className="relative shrink-0 overflow-hidden rounded-lg border border-slate-200/70 bg-white shadow-sm">
                      <img
                        src={methodBrandImg}
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
                      {m.gateway.code.replace(/_/g, '').slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{m.label}</p>
                    <p className="text-xs text-slate-500">{m.gateway.name}</p>
                  </div>
                </div>
                {isOwner ? (
                  <button
                    type="button"
                    onClick={() => void handleRemoveMethod(m.id)}
                    className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"
                    aria-label="Remove method"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No saved payment methods yet.</p>
        )}
      </PageCard>

      {user?.isPlatformOwner || user?.isPlatformAdmin ? (
        <p className="text-center text-xs text-slate-400">
          Signed in as platform staff — switch to a business workspace to use owner billing actions.
        </p>
      ) : null}

      <AnimatePresence>
        {payInvoicePicker ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <ModalOverlay
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setPayInvoicePicker(null)}
            />
            <CenteredModal className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="relative p-6">
                <button
                  type="button"
                  onClick={() => setPayInvoicePicker(null)}
                  className="absolute right-4 top-4 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
                <h2 className="pr-10 text-xl font-bold text-slate-900">Pay invoice</h2>
                {(() => {
                  const inv = pendingInvoices.find((i) => i.id === payInvoicePicker.invoiceId)
                  return inv ? (
                    <p className="mt-2 text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{formatGmd(inv.amount)}</span>
                      <span className="text-slate-400"> · </span>
                      Due {new Date(inv.dueDate).toLocaleDateString()}
                    </p>
                  ) : null
                })()}
                <p className="mt-4 text-sm text-slate-600">
                  Choose one of your saved payment methods. We’ll open checkout for that provider.
                </p>
                {methodsEligibleForInvoicePay.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    No saved methods are linked to a gateway with online checkout. Add a payment
                    method below for a provider that supports paying from the web, then try again.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {methodsEligibleForInvoicePay.map((m) => {
                      const selected = selectedPayMethodId === m.id
                      const payAdapter =
                        gateways.find((x) => x.code === m.gateway.code)?.checkoutAdapter ?? ''
                      const payBrandImg = checkoutWalletBrandImageSrc(payAdapter)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSelectedPayMethodId(m.id)}
                          aria-pressed={selected}
                          className={[
                            'w-full rounded-2xl border-2 p-4 text-left transition',
                            selected
                              ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/30'
                              : 'border-slate-200 bg-white hover:border-slate-300',
                          ].join(' ')}
                        >
                          <span className="flex items-start gap-3">
                            {payBrandImg ? (
                              <div className="relative shrink-0 overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-sm">
                                <img
                                  src={payBrandImg}
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
                                {m.gateway.code.replace(/_/g, '').slice(0, 2)}
                              </div>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-slate-900">{m.label}</span>
                              <span className="mt-1 block text-sm text-slate-600">{m.gateway.name}</span>
                              <span className="mt-1 block font-mono text-xs text-slate-500">
                                {m.gateway.code}
                              </span>
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {needsPhoneForSubscriptionWallet ? (
                  <div className="mt-4">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {selectedPayMethodCheckoutAdapter === 'aps_wallet'
                        ? 'APS mobile number'
                        : 'Yonna wallet phone'}
                    </label>
                    <input
                      type="tel"
                      autoComplete="tel"
                      placeholder={
                        selectedPayMethodCheckoutAdapter === 'aps_wallet'
                          ? 'e.g. 2XXXXXXX'
                          : 'e.g. +2207XXXXXXX'
                      }
                      value={yonnaPayerPhone}
                      onChange={(e) => setYonnaPayerPhone(e.target.value)}
                      className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none ring-teal-500 focus:ring-2"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      {selectedPayMethodCheckoutAdapter === 'aps_wallet'
                        ? 'The APS wallet number that will receive the SMS code. Enter the local number only (do not use +220).'
                        : 'The number registered on the Yonna wallet that will pay this invoice.'}
                    </p>
                  </div>
                ) : null}
                {selectedPayMethodCheckoutAdapter === 'aps_wallet' && apsAuthState ? (
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
                    onClick={() => setPayInvoicePicker(null)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={(() => {
                      const payLoading = checkoutLoadingKey === `pay:${payInvoicePicker.invoiceId}`
                      if (
                        !selectedPayMethodId ||
                        methodsEligibleForInvoicePay.length === 0 ||
                        payLoading
                      ) {
                        return true
                      }
                      if (selectedPayMethodCheckoutAdapter === 'aps_wallet') {
                        if (apsAuthState) {
                          return apsOtp.trim().length < 4
                        }
                        return !walletPhoneOk
                      }
                      return !walletPhoneOk
                    })()}
                    onClick={() => void handleProceedPayInvoice()}
                    className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {checkoutLoadingKey === `pay:${payInvoicePicker.invoiceId}` ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {selectedPayMethodCheckoutAdapter === 'aps_wallet' && !apsAuthState
                          ? 'Sending…'
                          : selectedPayMethodCheckoutAdapter === 'aps_wallet'
                            ? 'Paying…'
                            : 'Starting…'}
                      </span>
                    ) : selectedPayMethodCheckoutAdapter === 'aps_wallet' && !apsAuthState ? (
                      'Send OTP'
                    ) : selectedPayMethodCheckoutAdapter === 'aps_wallet' && apsAuthState ? (
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
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
                  hostedCheckoutModal.paymentHtml
                    ? 'p-5 sm:p-6'
                    : 'items-center p-8 text-center'
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
                      {hostedCheckoutModal.paymentMethodLabel ? (
                        <p className="mt-1 text-sm font-medium text-slate-600">
                          {hostedCheckoutModal.paymentMethodLabel}
                        </p>
                      ) : null}
                    </div>

                    <div className="mb-4 w-full rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/90 to-white px-4 py-3 text-center shadow-sm">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-800/70">
                        Amount due
                      </p>
                      <p className="text-2xl font-bold text-teal-700">
                        {formatCheckoutAmount(
                          hostedCheckoutModal.amount,
                          hostedCheckoutModal.currency,
                        )}
                      </p>
                    </div>

                    <p className="mb-3 text-center text-sm leading-relaxed text-slate-600">
                      Use the Yonna checkout below. Leave this window open—we refresh automatically
                      when payment succeeds.
                    </p>

                    <div className="w-full overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/[0.06]">
                      <div className="flex items-center gap-2.5 border-b border-slate-200/80 bg-white px-4 py-2.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
                          aria-hidden
                        />
                        <span className="text-xs font-semibold text-slate-700">Yonna wallet</span>
                        <span className="ml-auto text-[11px] font-medium text-slate-400">
                          Secure checkout
                        </span>
                      </div>
                      <iframe
                        title="Yonna wallet checkout"
                        className="block h-[min(640px,70vh)] min-h-[440px] w-full border-0 bg-white"
                        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
                        srcDoc={hostedCheckoutModal.paymentHtml}
                      />
                    </div>

                    <p className="mt-4 text-center text-xs leading-relaxed text-slate-400">
                      No separate payment link is needed—the embedded page is your checkout. You can
                      close this dialog after paying; we still record the payment when Yonna
                      confirms it.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mb-1 text-2xl font-bold text-slate-900">
                      Pay with {hostedCheckoutModal.gatewayName}
                    </h2>
                    {hostedCheckoutModal.paymentMethodLabel ? (
                      <p className="mb-2 text-sm font-medium text-slate-600">
                        {hostedCheckoutModal.paymentMethodLabel}
                      </p>
                    ) : null}
                    <p className="mb-6 max-w-sm text-sm text-slate-500">
                      {hostedCheckoutModal.launchUrl
                        ? 'Scan the QR with your wallet app, or use the payment link below. This page stays open—we refresh automatically when payment succeeds.'
                        : 'Follow your wallet instructions. This page stays open—we refresh automatically when payment succeeds.'}
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
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Payment link
                        </p>
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
                                    setError(
                                      'Could not copy link. Select the field and copy manually.',
                                    )
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
                        {formatCheckoutAmount(
                          hostedCheckoutModal.amount,
                          hostedCheckoutModal.currency,
                        )}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400">
                      Checkout is tied to this invoice only. You can close this dialog after paying;
                      we still record the payment when the provider confirms it.
                    </p>
                  </>
                )}

                <motion.div
                  className={`mt-4 flex items-center gap-2 text-xs text-slate-500 ${
                    hostedCheckoutModal.paymentHtml ? 'justify-center' : ''
                  }`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                >
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-teal-600" />
                  Waiting for payment confirmation…
                </motion.div>
              </div>
            </CenteredModal>
          </div>
        ) : null}
      </AnimatePresence>
    </PageTransition>
  )
}
