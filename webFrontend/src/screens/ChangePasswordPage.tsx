import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { APP_PATHS, getDefaultProtectedPath } from '../config/navigation'
import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { useAuth } from '../features/auth/AuthContext'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { user, changePassword } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!user) {
    return null
  }

  const mustChangePassword = user.mustChangePassword

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSubmitting) {
      return
    }

    setError(null)
    setSuccess(null)

    if (!currentPassword.trim() || !newPassword.trim()) {
      setError('Current password and new password are required.')
      return
    }

    if (newPassword.trim().length < 6) {
      setError('New password must be at least 6 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await changePassword(currentPassword, newPassword)

      if (!result.ok) {
        setError(result.error ?? 'Unable to change password.')
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSuccess(result.message ?? 'Password updated successfully.')

      if (mustChangePassword) {
        navigate(getDefaultProtectedPath(user.role) || APP_PATHS.dashboard, {
          replace: true,
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-6">
      <PageCard className="p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
          Account Security
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">Change password</h1>
        <p className="mt-2 text-slate-600">
          {mustChangePassword
            ? 'Use the temporary password from your email, then create a new password to continue.'
            : 'Update your password for this account.'}
        </p>
        <p className="mt-3 text-sm text-slate-500">Signed in as {user.email}</p>
      </PageCard>

      <PageCard className="p-6">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              {mustChangePassword ? 'Temporary password' : 'Current password'}
            </span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">New password</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-slate-700">
              Confirm new password
            </span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Updating password...' : 'Update password'}
          </button>
        </form>
      </PageCard>
    </PageTransition>
  )
}
