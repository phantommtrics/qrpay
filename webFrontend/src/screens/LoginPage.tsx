import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, LockKeyhole, QrCode } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'

export function LoginPage() {
  const navigate = useNavigate()
  const { loginWithCredentials } = useAuth()
  const [email, setEmail] = useState('owner@sunrise.com')
  const [password, setPassword] = useState('demo123')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const result = loginWithCredentials(email, password)

    if (!result.ok) {
      setError(result.error ?? 'Sign in failed.')
      return
    }

    navigate(APP_PATHS.dashboard)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900">
            <QrCode className="h-7 w-7 text-teal-400" />
          </div>
          <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
            Sign In
          </p>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Welcome back to QRPay</h1>
          <p className="mt-3 text-sm text-slate-500">
            Sign in with your business or platform owner account.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              />
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800">
              <LockKeyhole className="mr-2 h-4 w-4" />
              Sign In
            </button>
          </form>

          <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
            Demo examples: `owner@qrpay.com`, `owner@sunrise.com`, `owner@baobab.com`
            with password `demo123`.
          </div>

          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <Link to={APP_PATHS.root} className="hover:text-teal-600">
              Back to website
            </Link>
            <Link to={APP_PATHS.signup} className="inline-flex items-center font-medium text-teal-600">
              Create organization
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
