import { useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

import { getPageTitle } from '../config/navigation'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

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
          <div className="mx-auto h-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
