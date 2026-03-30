import { useEffect, useRef, useState } from 'react'
import {
  Bell,
  Building2,
  Check,
  ChevronDown,
  Menu,
  Plus,
  Search,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'

export function Header({
  title,
  onMenuClick,
}: {
  title: string
  onMenuClick: () => void
}) {
  const navigate = useNavigate()
  const {
    currentOrganization,
    currentPlan,
    organizations,
    setActiveOrganization,
    subscriptionStatus,
    subscriptionDaysLeft,
    user,
  } = useAuth()
  const [isBusinessMenuOpen, setIsBusinessMenuOpen] = useState(false)
  const businessMenuRef = useRef<HTMLDivElement | null>(null)
  const subscriptionText = user?.isPlatformOwner
    ? 'No subscription required'
    : subscriptionStatus === 'trialing'
      ? `${currentPlan?.name ?? 'No'} plan trial${
          subscriptionDaysLeft !== null ? `, ${subscriptionDaysLeft} day(s) left to pay` : ''
        }`
      : subscriptionStatus === 'past_due'
        ? `${currentPlan?.name ?? 'No'} plan, payment overdue`
        : `${currentPlan?.name ?? 'No'} plan${
            subscriptionStatus === 'expiring_soon' && subscriptionDaysLeft
              ? `, ${subscriptionDaysLeft} day(s) left`
              : subscriptionStatus === 'expired'
                ? ', expired'
                : ''
          }`

  useEffect(() => {
    if (!isBusinessMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!businessMenuRef.current?.contains(event.target as Node)) {
        setIsBusinessMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handlePointerDown)

    return () => {
      window.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isBusinessMenuOpen])

  return (
    <header className="print:hidden sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="mr-3 -ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="flex items-center gap-3 xl:gap-4">
        <div className="hidden items-center gap-3 lg:flex">
          {!user?.isPlatformOwner && organizations.length > 0 ? (
            <div className="relative" ref={businessMenuRef}>
              <button
                onClick={() => setIsBusinessMenuOpen((current) => !current)}
                className="flex w-[280px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-left shadow-sm transition-all hover:border-teal-200 hover:bg-teal-50/40 xl:w-[320px]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {currentOrganization?.name ?? 'Select business'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {organizations.length} business{organizations.length === 1 ? '' : 'es'} on this
                    account
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 transition-transform ${
                    isBusinessMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isBusinessMenuOpen ? (
                <div className="absolute right-0 top-full z-40 mt-3 w-[340px] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl xl:w-[380px]">
                  <div className="border-b border-slate-100 bg-slate-50 px-5 py-4">
                    <p className="text-sm font-semibold text-slate-900">Switch business</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Move between businesses or add a new one to this account.
                    </p>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-3">
                    {organizations.map((organization) => {
                      const isActive = organization.id === currentOrganization?.id
                      const restrictedHere =
                        !organization.isOwner &&
                        (organization.membershipStatus === 'BLOCKED' ||
                          organization.membershipStatus === 'SUSPENDED')
                      const currentRestricted = isActive && restrictedHere

                      if (currentRestricted) {
                        return (
                          <div
                            key={organization.id}
                            className="mb-2 flex w-full cursor-not-allowed items-start gap-3 rounded-2xl border border-red-200 bg-red-50/80 px-3 py-3 text-left opacity-95 last:mb-0"
                            role="presentation"
                            aria-label="Current business: access restricted"
                          >
                            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-red-100 text-red-700">
                              <Building2 className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="truncate text-sm font-semibold text-red-900">
                                  {organization.name}
                                </p>
                                <span className="rounded-full bg-red-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
                                  {organization.membershipStatus === 'BLOCKED' ? 'Blocked' : 'Suspended'}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-red-700/90">
                                No access — switch to another business below.
                              </p>
                            </div>
                          </div>
                        )
                      }

                      return (
                        <button
                          key={organization.id}
                          onClick={() => {
                            setActiveOrganization(organization.id)
                            setIsBusinessMenuOpen(false)
                          }}
                          className={`mb-2 flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors last:mb-0 ${
                            isActive
                              ? 'bg-teal-50 ring-1 ring-teal-200'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl ${
                              isActive
                                ? 'bg-teal-600 text-white'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isActive ? <Check className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {organization.name}
                              </p>
                              {organization.isOwner ? (
                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                                  Owner
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {organization.industry} · {organization.staffCount} staff
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="border-t border-slate-100 p-3">
                    <button
                      onClick={() => {
                        setIsBusinessMenuOpen(false)
                        navigate(APP_PATHS.businesses)
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      Add business
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 2xl:flex">
            <div className="text-right">
              <p className="text-xs font-semibold text-slate-800">
                {user?.isPlatformOwner
                  ? 'Platform Owner'
                  : currentOrganization?.name ?? 'No organization'}
              </p>
              <p className="text-[11px] text-slate-500">{subscriptionText}</p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                user?.isPlatformOwner
                  ? 'bg-indigo-100 text-indigo-700'
                  : subscriptionStatus === 'expired'
                    ? 'bg-red-100 text-red-700'
                    : subscriptionStatus === 'past_due'
                      ? 'bg-red-100 text-red-700'
                      : subscriptionStatus === 'trialing'
                        ? 'bg-blue-100 text-blue-700'
                        : subscriptionStatus === 'expiring_soon'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {user?.isPlatformOwner
                ? 'Owner'
                : subscriptionStatus === 'expired'
                  ? 'Expired'
                  : subscriptionStatus === 'past_due'
                    ? 'Past Due'
                    : subscriptionStatus === 'trialing'
                      ? 'Trial'
                      : subscriptionStatus === 'expiring_soon'
                        ? 'Expiring'
                        : 'Active'}
            </span>
          </div>
        </div>
        <div className="relative hidden 2xl:flex">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-64 rounded-full border border-transparent bg-slate-100 py-2 pr-4 pl-9 text-sm outline-none transition-all focus:border-teal-500 focus:bg-white focus:ring-2 focus:ring-teal-200"
          />
        </div>
        <button className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100">
          <Bell className="h-5 w-5" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full border-2 border-white bg-amber-500" />
        </button>
      </div>
    </header>
  )
}
