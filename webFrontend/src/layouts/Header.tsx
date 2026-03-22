import { Bell, Menu, Search } from 'lucide-react'

import { useAuth } from '../features/auth/AuthContext'

export function Header({
  title,
  onMenuClick,
}: {
  title: string
  onMenuClick: () => void
}) {
  const {
    currentOrganization,
    currentPlan,
    organizations,
    setActiveOrganization,
    subscriptionStatus,
    subscriptionDaysLeft,
    user,
  } = useAuth()
  const subscriptionText = user?.isPlatformOwner
    ? 'Bypasses subscription limits'
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

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-8">
      <div className="flex items-center">
        <button
          onClick={onMenuClick}
          className="mr-3 -ml-2 rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
        >
          <Menu className="h-6 w-6" />
        </button>
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 lg:flex">
          <div className="text-right">
            <p className="text-xs font-semibold text-slate-800">
              {user?.isPlatformOwner ? 'Platform Owner' : currentOrganization?.name ?? 'No organization'}
            </p>
            <p className="text-[11px] text-slate-500">{subscriptionText}</p>
          </div>
          {!user?.isPlatformOwner && organizations.length > 1 ? (
            <select
              value={currentOrganization?.id ?? ''}
              onChange={(event) => setActiveOrganization(event.target.value)}
              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          ) : null}
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
        <div className="relative hidden md:flex">
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
