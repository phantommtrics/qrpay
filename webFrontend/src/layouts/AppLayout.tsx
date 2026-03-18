import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { Header } from './Header'
import { Sidebar } from './Sidebar'
import type { User } from '../types'

function getPageTitle(pathname: string) {
  if (pathname.includes('/dashboard')) return 'Dashboard'
  if (pathname.includes('/products')) return 'Products'
  if (pathname.includes('/pos')) return 'Point of Sale'
  if (pathname.includes('/orders')) return 'Orders'
  if (pathname.includes('/payments')) return 'Payments'
  if (pathname.includes('/reports')) return 'Reports'
  return 'QRPay'
}

export function AppLayout({
  user,
  onLogout,
  children,
}: {
  user: User
  onLogout: () => void
  children: ReactNode
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setIsSidebarOpen(false)
  }, [location.pathname])

  const title = useMemo(() => getPageTitle(location.pathname), [location.pathname])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        user={user}
        onLogout={onLogout}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header title={title} onMenuClick={() => setIsSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          <div className="mx-auto h-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
