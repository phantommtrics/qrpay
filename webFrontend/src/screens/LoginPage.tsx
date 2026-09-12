import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, LockKeyhole, Shield } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { OtpInput, type OtpInputRef } from '../components/ui/OtpInput'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  ApiError,
  clearMfaPreAuthToken,
  getMfaPreAuthToken,
  setupMfaWithPreAuth,
} from '../services/subscriptionApi'

type LoginLocationState = {
  postSignupNotice?: string
}

type Step = 'credentials' | 'totp' | 'setup'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { loginWithCredentials, completeMfaLogin, completeMfaSetup } = useAuth()
  const [step, setStep] = useState<Step>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [setupSecret, setSetupSecret] = useState('')
  const [setupQr, setSetupQr] = useState('')
  const [setupLoading, setSetupLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const totpRef = useRef<OtpInputRef>(null)

  const postSignupNotice =
    (location.state as LoginLocationState | null)?.postSignupNotice ?? null

  const finishLogin = useCallback(
    (redirectPath?: string) => {
      navigate(redirectPath ?? APP_PATHS.dashboard)
    },
    [navigate],
  )

  const beginSetup = useCallback(async () => {
    if (!getMfaPreAuthToken()) {
      setError('Verification session expired. Sign in again.')
      setStep('credentials')
      return
    }
    setSetupLoading(true)
    setError(null)
    try {
      const data = await setupMfaWithPreAuth()
      setSetupSecret(data.secret)
      setSetupQr(data.qrDataUrl)
      setStep('setup')
      setTotp('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start authenticator setup.')
      setStep('credentials')
      clearMfaPreAuthToken()
    } finally {
      setSetupLoading(false)
    }
  }, [])

  const handleCredentialsSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const result = await loginWithCredentials(email, password)

    if (!result.ok) {
      setError(result.error ?? 'Sign in failed.')
      setIsSubmitting(false)
      return
    }

    if (result.mfaRequired) {
      setIsSubmitting(false)
      if (!result.totpEnrolled) {
        await beginSetup()
        return
      }
      setStep('totp')
      setTotp('')
      window.setTimeout(() => totpRef.current?.focus(), 400)
      return
    }

    setIsSubmitting(false)
    finishLogin(result.redirectPath)
  }

  const handleVerifyTotp = useCallback(
    async (code?: string) => {
      const value = code ?? totp
      if (value.length !== 6) return
      setError(null)
      setIsSubmitting(true)
      const result = await completeMfaLogin(value)
      if (!result.ok) {
        setError(result.error ?? 'Invalid authenticator code.')
        setTotp('')
        totpRef.current?.focus()
        setIsSubmitting(false)
        return
      }
      setIsSubmitting(false)
      finishLogin(result.redirectPath)
    },
    [completeMfaLogin, finishLogin, totp],
  )

  const handleConfirmSetup = useCallback(
    async (code?: string) => {
      const value = code ?? totp
      if (value.length !== 6 || !setupSecret) return
      setError(null)
      setIsSubmitting(true)
      const result = await completeMfaSetup(setupSecret, value)
      if (!result.ok) {
        setError(result.error ?? 'Invalid authenticator code.')
        setTotp('')
        setIsSubmitting(false)
        return
      }
      setIsSubmitting(false)
      finishLogin(result.redirectPath)
    },
    [completeMfaSetup, finishLogin, setupSecret, totp],
  )

  useEffect(() => {
    if (step === 'setup' && !setupSecret && getMfaPreAuthToken()) {
      void beginSetup()
    }
  }, [beginSetup, setupSecret, step])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <img
            src="/logos/Direct%20Pay-02.png"
            alt="DirectPay"
            className="h-auto max-h-28 w-full max-w-[15rem] object-contain"
            width={220}
            height={110}
          />
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            {step === 'credentials' ? 'Sign In' : 'Authenticator'}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">
            {step === 'credentials' && 'Welcome back to DirectPay'}
            {step === 'totp' && 'Enter authenticator code'}
            {step === 'setup' && 'Set up authenticator'}
          </h1>
          {step !== 'credentials' ? (
            <p className="mt-2 text-sm text-slate-600">
              {step === 'totp'
                ? 'Enter the 6-digit code from your authenticator app.'
                : 'Scan the QR code with Google Authenticator, 1Password, or another TOTP app. Required for platform admin sign-in.'}
            </p>
          ) : null}
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {step === 'credentials' ? (
            <form className="space-y-5" onSubmit={handleCredentialsSubmit}>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                  autoComplete="email"
                />
              </label>

              <label className="block">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="block text-sm font-medium text-slate-700">Password</span>
                  <Link to={APP_PATHS.forgotPassword} className="text-sm font-medium text-teal-600">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                  autoComplete="current-password"
                />
              </label>

              {postSignupNotice ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {postSignupNotice}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <button
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <LockKeyhole className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : null}

          {step === 'totp' ? (
            <div className="space-y-5">
              <OtpInput
                ref={totpRef}
                value={totp}
                onChange={(value) => {
                  setTotp(value)
                  if (error) setError(null)
                }}
                onComplete={handleVerifyTotp}
                disabled={isSubmitting}
                error={Boolean(error)}
                autoFocus
              />
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              {totp.length === 6 ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleVerifyTotp()}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-70"
                >
                  <Shield className="mr-2 h-4 w-4" />
                  {isSubmitting ? 'Verifying…' : 'Verify and sign in'}
                </button>
              ) : null}
              <button
                type="button"
                className="w-full text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => {
                  clearMfaPreAuthToken()
                  setStep('credentials')
                  setTotp('')
                  setError(null)
                }}
              >
                Back to password
              </button>
            </div>
          ) : null}

          {step === 'setup' ? (
            <div className="space-y-5">
              {setupLoading ? (
                <p className="text-center text-sm text-slate-500">Preparing setup…</p>
              ) : (
                <>
                  {setupQr ? (
                    <img
                      src={setupQr}
                      alt="Authenticator QR code"
                      className="mx-auto h-48 w-48 rounded-xl border border-slate-200"
                    />
                  ) : null}
                  {setupSecret ? (
                    <div className="rounded-xl bg-slate-50 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Manual entry key
                      </p>
                      <p className="mt-1 break-all font-mono text-sm text-slate-800">{setupSecret}</p>
                    </div>
                  ) : null}
                  <OtpInput
                    value={totp}
                    onChange={(value) => {
                      setTotp(value)
                      if (error) setError(null)
                    }}
                    onComplete={handleConfirmSetup}
                    disabled={isSubmitting}
                    error={Boolean(error)}
                    autoFocus
                  />
                </>
              )}
              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              {totp.length === 6 && setupSecret ? (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleConfirmSetup()}
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-600 px-4 py-3 font-semibold text-white hover:bg-teal-500 disabled:opacity-70"
                >
                  {isSubmitting ? 'Confirming…' : 'Complete setup'}
                </button>
              ) : null}
              <button
                type="button"
                className="w-full text-sm font-medium text-slate-600 hover:text-slate-900"
                onClick={() => {
                  clearMfaPreAuthToken()
                  setStep('credentials')
                  setTotp('')
                  setSetupSecret('')
                  setSetupQr('')
                  setError(null)
                }}
              >
                Back to password
              </button>
            </div>
          ) : null}

          {step === 'credentials' ? (
            <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
              <Link to={APP_PATHS.root} className="hover:text-teal-600">
                Back to website
              </Link>
              <Link
                to={APP_PATHS.signup}
                className="inline-flex items-center font-medium text-teal-600"
              >
                Create organization
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </motion.div>
      </motion.div>
    </div>
  )
}
