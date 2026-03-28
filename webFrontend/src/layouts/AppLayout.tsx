import { useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthContext'
import { getPageTitle } from '../config/navigation'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

function AppMainContent({ children }: { children: ReactNode }) {
  const { user, currentOrganization, organizations, setActiveOrganization } = useAuth()

  const restricted =
    Boolean(currentOrganization) &&
    !user?.isPlatformOwner &&
    !currentOrganization!.isOwner &&
    (currentOrganization!.membershipStatus === 'BLOCKED' ||
      currentOrganization!.membershipStatus === 'SUSPENDED')

  if (restricted && currentOrganization) {
    const alternatives = organizations.filter(
      (o) =>
        o.id !== currentOrganization.id &&
        (o.isOwner || o.membershipStatus == null || o.membershipStatus === 'ACTIVE'),
    )
    const label =
      currentOrganization.membershipStatus === 'BLOCKED'
        ? 'Your access to this business has been blocked.'
        : 'Your access to this business has been suspended.'

    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 rounded-2xl border border-red-200 bg-red-50/50 p-8 text-center">
        <div className="max-w-md">
          <h2 className="text-xl font-semibold text-red-900">Unauthorized access</h2>
          <p className="mt-2 text-sm text-red-800">{label}</p>
        </div>
        {alternatives.length > 0 ? (
          <div className="w-full max-w-sm text-left">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Switch to another business
            </p>
            <ul className="space-y-2">
              {alternatives.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
                    onClick={() => setActiveOrganization(o.id)}
                  >
                    {o.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    )
  }

  return <>{children}</>
}

export function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  const title = useMemo(() => getPageTitle(location.pathname), [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto h-full max-w-7xl">
            <AppMainContent>{children}</AppMainContent>
          </div>
        </main>
      </div>
    </div>
  )
}
