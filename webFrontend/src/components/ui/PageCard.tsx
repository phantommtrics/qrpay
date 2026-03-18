import type { ReactNode } from 'react'

export function PageCard({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-slate-100 bg-white shadow-sm ${className}`}>
      {children}
    </div>
  )
}
