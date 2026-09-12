import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, X } from 'lucide-react'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { Toast, type ToastVariant } from '../components/ui/Toast'
import { normalizeBusinessLogoUrlForDisplay } from '../config/api'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchMerchantProfile,
  removeMerchantBusinessLogo,
  uploadMerchantBusinessLogo,
  type MerchantProfile,
} from '../services/merchantProfileApi'
import { ApiError } from '../services/subscriptionApi'

const fieldClass =
  'w-full rounded-md border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading outline-none focus:border-qb-heading'

export function MerchantProfilePage() {
  const { user, currentOrganization, changePassword, patchOrganization } = useAuth()
  const businessId = currentOrganization?.id ?? null

  const [profile, setProfile] = useState<MerchantProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [logoBusy, setLogoBusy] = useState(false)
  const [toast, setToast] = useState<{ message: string; variant: ToastVariant } | null>(null)

  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    try {
      setProfile(await fetchMerchantProfile(businessId))
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not load profile.',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    void load()
  }, [load])

  function applyLogoUrl(logoUrl: string | null) {
    if (!businessId) return
    setProfile((prev) =>
      prev ? { ...prev, business: { ...prev.business, logoUrl } } : prev,
    )
    patchOrganization(businessId, { logoUrl })
  }

  async function onLogoSelected(file: File | null) {
    if (!businessId || !file || logoBusy) return
    setLogoBusy(true)
    try {
      const data = await uploadMerchantBusinessLogo(businessId, file)
      applyLogoUrl(data.logoUrl)
      setToast({ message: 'Logo updated.', variant: 'success' })
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not upload logo.',
        variant: 'error',
      })
    } finally {
      setLogoBusy(false)
    }
  }

  async function onRemoveLogo() {
    if (!businessId || logoBusy) return
    setLogoBusy(true)
    try {
      await removeMerchantBusinessLogo(businessId)
      applyLogoUrl(null)
      setToast({ message: 'Logo removed.', variant: 'success' })
    } catch (err) {
      setToast({
        message: err instanceof ApiError ? err.message : 'Could not remove logo.',
        variant: 'error',
      })
    } finally {
      setLogoBusy(false)
    }
  }

  function openPasswordModal() {
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPasswordError(null)
    setPasswordModalOpen(true)
  }

  function closePasswordModal() {
    if (passwordBusy) return
    setPasswordModalOpen(false)
    setPasswordError(null)
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault()
    if (passwordBusy || !user) return
    setPasswordError(null)
    if (!currentPassword.trim() || !newPassword.trim()) {
      setPasswordError('Current and new password are required.')
      return
    }
    if (newPassword.trim().length < 6) {
      setPasswordError('New password must be at least 6 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    setPasswordBusy(true)
    try {
      const result = await changePassword(currentPassword, newPassword)
      if (!result.ok) {
        setPasswordError(result.error ?? 'Unable to change password.')
        return
      }
      setPasswordModalOpen(false)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setToast({ message: result.message ?? 'Password updated.', variant: 'success' })
    } finally {
      setPasswordBusy(false)
    }
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <h1 className="text-xl font-semibold text-qb-heading">Profile</h1>
          <p className="mt-4 text-qb-muted">Select a business to continue.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const logoSrc = normalizeBusinessLogoUrlForDisplay(profile?.business.logoUrl)

  const passwordModal =
    passwordModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            role="presentation"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) closePasswordModal()
            }}
          >
            <div className="absolute inset-0 bg-slate-900/40" aria-hidden />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="change-password-title"
              className="relative z-10 w-full max-w-md rounded-md border border-qb-border bg-white p-5 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <h2
                  id="change-password-title"
                  className="text-lg font-semibold text-qb-heading"
                >
                  Change password
                </h2>
                <button
                  type="button"
                  onClick={closePasswordModal}
                  disabled={passwordBusy}
                  className="rounded p-1 text-qb-muted hover:bg-qb-surface hover:text-qb-heading disabled:opacity-45"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1 text-sm text-qb-muted">Signed in as {user?.email}</p>

              <form onSubmit={onChangePassword} className="mt-4 space-y-4">
                {passwordError ? (
                  <div className="rounded-md border border-red-200 bg-red-50/80 p-3">
                    <p className="text-sm font-medium text-red-800">{passwordError}</p>
                  </div>
                ) : null}
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-qb-heading">
                    Current password
                  </span>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className={fieldClass}
                    disabled={passwordBusy}
                    autoComplete="current-password"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-qb-heading">
                    New password
                  </span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={fieldClass}
                    disabled={passwordBusy}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-qb-heading">
                    Confirm new password
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={fieldClass}
                    disabled={passwordBusy}
                    autoComplete="new-password"
                  />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closePasswordModal}
                    disabled={passwordBusy}
                    className="inline-flex h-10 items-center rounded-md border border-qb-border bg-white px-4 text-sm font-semibold text-qb-heading hover:bg-qb-surface disabled:opacity-45"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={passwordBusy}
                    className="inline-flex h-10 items-center gap-2 rounded-md bg-qb-heading px-4 text-sm font-semibold text-white disabled:opacity-45"
                  >
                    {passwordBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Update password
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <PageTransition>
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <PageCard variant="plain">
          <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Profile</h1>
          <p className="mt-1 text-sm text-qb-muted">
            {currentOrganization?.name ?? 'Business'} · account &amp; document branding
          </p>
        </PageCard>

        {loading ? (
          <PageCard variant="plain" className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-qb-muted" />
          </PageCard>
        ) : profile ? (
          <>
            <PageCard variant="plain" className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">Account</h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-qb-muted">Name</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">{profile.user.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-qb-muted">Email</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">{profile.user.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-qb-muted">Role</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">{profile.user.role}</dd>
                </div>
                <div>
                  <dt className="text-xs text-qb-muted">Membership</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">
                    {profile.membership.isOwner ? 'Owner' : 'Staff'} · {profile.membership.status}
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={openPasswordModal}
                className="inline-flex h-10 items-center rounded-md border border-qb-border bg-white px-4 text-sm font-semibold text-qb-heading hover:bg-qb-surface"
              >
                Change password
              </button>
            </PageCard>

            <PageCard variant="plain" className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">
                Business
              </h2>
              <dl className="grid gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-qb-muted">Name</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">
                    {profile.business.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-qb-muted">Slug</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">
                    {profile.business.slug}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-qb-muted">Industry</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">
                    {profile.business.industry?.trim() || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-qb-muted">Owner</dt>
                  <dd className="mt-0.5 text-sm font-medium text-qb-heading">
                    {profile.business.ownerName}
                    <span className="block text-xs font-normal text-qb-muted">
                      {profile.business.ownerEmail}
                    </span>
                  </dd>
                </div>
              </dl>
            </PageCard>

            <PageCard variant="plain" className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-qb-muted">
                Document logo
              </h2>
              <div className="flex flex-wrap items-start gap-6">
                <div className="relative flex h-24 w-40 items-center justify-center overflow-hidden rounded-md border border-qb-border bg-qb-surface/40 p-3">
                  {logoBusy ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                      <Loader2 className="h-6 w-6 animate-spin text-qb-muted" />
                    </div>
                  ) : null}
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt=""
                      className={`max-h-full max-w-full object-contain ${logoBusy ? 'opacity-40' : ''}`}
                    />
                  ) : (
                    <span className={`text-xs text-qb-muted ${logoBusy ? 'opacity-40' : ''}`}>
                      No logo
                    </span>
                  )}
                </div>
                {profile.membership.isOwner ? (
                  <div className="space-y-3">
                    <label
                      className={`inline-flex items-center gap-2 rounded-md border border-qb-border bg-white px-3 py-2 text-sm font-semibold text-qb-heading hover:bg-qb-surface ${
                        logoBusy ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
                      }`}
                    >
                      Upload logo
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={logoBusy}
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          e.target.value = ''
                          void onLogoSelected(file)
                        }}
                      />
                    </label>
                    {profile.business.logoUrl ? (
                      <button
                        type="button"
                        disabled={logoBusy}
                        onClick={() => void onRemoveLogo()}
                        className="block text-sm font-medium text-qb-muted hover:text-qb-heading disabled:opacity-45"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-qb-muted">Only the business owner can change the logo.</p>
                )}
              </div>
            </PageCard>
          </>
        ) : null}
      </div>

      {passwordModal}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={() => setToast(null)} />
      ) : null}
    </PageTransition>
  )
}
