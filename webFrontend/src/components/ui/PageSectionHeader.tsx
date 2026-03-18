import type { ReactNode } from 'react'

export function PageSectionHeader({
  title,
  action,
  className = '',
}: {
  title: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {action}
    </div>
  )
}
