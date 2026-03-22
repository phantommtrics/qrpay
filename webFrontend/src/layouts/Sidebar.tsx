import { useEffect, useState } from 'react'
import { Check, ChevronDown, LockKeyhole, LogOut, Plus, QrCode } from 'lucide-react'
import { NavLink, useNavigate } from 'react-router-dom'

import { APP_PATHS, MAIN_NAV_ITEMS, RESTAURANT_NAV_ITEM } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'

const BUSINESS_SECTION_STORAGE_KEY = 'qrpay.sidebar.businesses.open.v1'

export function Sidebar({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean
  setIsOpen: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const [isBusinessSectionOpen, setIsBusinessSectionOpen] = useState(() => {
    if (typeof window === 'undefined') {
      return true
    }

    const stored = window.localStorage.getItem(BUSINESS_SECTION_STORAGE_KEY)
    return stored ? stored === 'true' : true
  })
  const {
    user,
    logout,
    canAccess,
    currentOrganization,
    organizations,
    setActiveOrganization,
    subscriptionStatus,
  } = useAuth()

  if (!user) {
    return null
  }

  const navItems = MAIN_NAV_ITEMS.filter(
    (item) => (user.isPlatformOwner || item.roles.includes(user.role)) && canAccess(item.permission),
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      BUSINESS_SECTION_STORAGE_KEY,
      String(isBusinessSectionOpen),
    )
  }, [isBusinessSectionOpen])

  return (
    <>
      {isOpen ? (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 text-slate-300 transition-transform duration-300 lg:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="flex h-16 items-center border-b border-slate-800 px-6">
          <QrCode className="mr-3 h-8 w-8 text-teal-500" />
          <span className="text-xl font-bold tracking-tight text-white">QRPay</span>
        </div>

        <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-6">
          {!user.isPlatformOwner && organizations.length > 0 ? (
            <>
              <button
                onClick={() => setIsBusinessSectionOpen((current) => !current)}
                className="mb-2 flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300"
              >
                <span className="truncate">
                  Businesses
                  {currentOrganization ? ` · ${currentOrganization.name}` : ''}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    isBusinessSectionOpen ? 'rotate-0' : '-rotate-90'
                  }`}
                />
              </button>
              {isBusinessSectionOpen ? (
                <div className="mb-4 space-y-1 px-1">
                  {organizations.map((organization) => {
                    const isActive = organization.id === currentOrganization?.id

                    return (
                      <button
                        key={organization.id}
                        onClick={() => {
                          setActiveOrganization(organization.id)
                          setIsOpen(false)
                        }}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-teal-500/10 text-teal-300'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            isActive ? 'bg-teal-400' : 'bg-slate-600'
                          }`}
                        />
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {organization.name}
                        </span>
                        {isActive ? <Check className="h-4 w-4 shrink-0" /> : null}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => {
                      setIsOpen(false)
                      navigate(APP_PATHS.businesses)
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-teal-300 transition-colors hover:bg-slate-800 hover:text-teal-200"
                  >
                    <Plus className="h-4 w-4" />
                    Add business
                  </button>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Main Menu
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsOpen(false)}
              className={({ isActive }) =>
                `flex items-center rounded-lg border-l-2 px-3 py-2.5 transition-colors ${
                  isActive
                    ? 'border-teal-500 bg-teal-500/10 text-teal-400'
                    : 'border-transparent hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <item.icon className="mr-3 h-5 w-5" />
              <span className="font-medium">{item.name}</span>
            </NavLink>
          ))}

          {user.role !== 'cashier' ? (
            <>
              <div className="mt-6 mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Restaurant
              </div>
              <NavLink
                to={RESTAURANT_NAV_ITEM.path}
                onClick={() => setIsOpen(false)}
                className="flex items-center rounded-lg border-l-2 border-transparent px-3 py-2.5 transition-colors hover:bg-slate-800 hover:text-white"
              >
                <RESTAURANT_NAV_ITEM.icon className="mr-3 h-5 w-5" />
                <span className="font-medium">{RESTAURANT_NAV_ITEM.name}</span>
              </NavLink>
            </>
          ) : null}
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-4 flex items-center px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-600 font-bold text-white">
              {user.name.charAt(0)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="text-xs text-slate-400">
                {user.isPlatformOwner
                  ? 'Platform owner'
                  : currentOrganization
                    ? `${currentOrganization.name} · ${
                        subscriptionStatus === 'expired'
                          ? 'expired'
                          : subscriptionStatus === 'expiring_soon'
                            ? 'expiring'
                            : subscriptionStatus === 'past_due'
                              ? 'past due'
                              : subscriptionStatus === 'trialing'
                                ? 'trial'
                                : 'active'
                      }`
                    : user.role}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsOpen(false)
              navigate(APP_PATHS.changePassword)
            }}
            className="mb-1 flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LockKeyhole className="mr-3 h-4 w-4" />
            Change Password
          </button>
          <button
            onClick={logout}
            className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <LogOut className="mr-3 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
