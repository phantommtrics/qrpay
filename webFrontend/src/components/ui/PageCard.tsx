import type { ReactNode } from 'react'

export function PageCard({
  children,
  className = '',
  variant = 'default',
}: {
  children: ReactNode
  className?: string
  /** `plain`: no border, shadow, or card chrome (for minimal accounting layouts). */
  variant?: 'default' | 'plain'
}) {
  const shell =
    variant === 'plain'
      ? 'rounded-none border-0 bg-transparent shadow-none'
      : 'rounded-xl border border-slate-100 bg-white shadow-sm'
  return <div className={`${shell} ${className}`}>{children}</div>
}
