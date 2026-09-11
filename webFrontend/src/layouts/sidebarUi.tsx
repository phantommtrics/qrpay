import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

function navLabelClass(collapsed: boolean) {
  return collapsed ? 'truncate lg:hidden' : 'truncate'
}

function navIconClass(collapsed: boolean) {
  return `h-5 w-5 shrink-0 ${collapsed ? 'mr-3 lg:mr-0' : 'mr-3'}`
}

function navLinkClass(collapsed: boolean, active: boolean) {
  return [
    'flex items-center rounded-lg border-l-2 py-2.5 transition-colors',
    collapsed ? 'px-3 lg:justify-center lg:border-l-0 lg:px-0' : 'px-3',
    active
      ? 'border-teal-500 bg-teal-500/10 text-teal-400'
      : 'border-transparent hover:bg-slate-800 hover:text-white',
  ].join(' ')
}

export function SidebarIconLink({
  to,
  collapsed,
  icon: Icon,
  label,
  onNavigate,
}: {
  to: string
  collapsed: boolean
  icon: LucideIcon
  label: string
  onNavigate: () => void
}) {
  return (
    <NavLink
      to={to}
      title={label}
      onClick={onNavigate}
      className={({ isActive }) => navLinkClass(collapsed, isActive)}
    >
      <Icon className={navIconClass(collapsed)} />
      <span className={`font-medium ${navLabelClass(collapsed)}`}>{label}</span>
    </NavLink>
  )
}

function placeFlyout(trigger: HTMLElement) {
  const rect = trigger.getBoundingClientRect()
  const left = rect.right + 8
  const estimatedHeight = Math.min(360, window.innerHeight - 32)
  let top = rect.top
  if (top + estimatedHeight > window.innerHeight - 16) {
    top = Math.max(16, window.innerHeight - estimatedHeight - 16)
  }
  return { top, left }
}

export function CollapsedSection({
  icon: Icon,
  label,
  active,
  children,
}: {
  icon: LucideIcon
  label: string
  active?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number>(0)
  const [coords, setCoords] = useState({ top: 0, left: 0 })

  const show = () => {
    window.clearTimeout(closeTimer.current)
    if (triggerRef.current) {
      setCoords(placeFlyout(triggerRef.current))
    }
    setOpen(true)
  }

  const hide = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 160)
  }

  useEffect(() => {
    return () => window.clearTimeout(closeTimer.current)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    const sync = () => {
      if (triggerRef.current) {
        setCoords(placeFlyout(triggerRef.current))
      }
    }
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [open])

  return (
    <div className="relative" onMouseEnter={show} onMouseLeave={hide}>
      <button
        ref={triggerRef}
        type="button"
        title={label}
        aria-label={label}
        aria-expanded={open}
        onClick={show}
        className={`flex w-full items-center justify-center rounded-lg py-2.5 transition-colors ${
          active
            ? 'bg-teal-500/10 text-teal-400'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <Icon className="h-5 w-5 shrink-0" />
      </button>
      {open
        ? createPortal(
            <div
              className="fixed z-[80] min-w-[15rem] max-w-[18rem] rounded-xl border border-slate-700 bg-slate-900 py-2 text-slate-300 shadow-2xl"
              style={{ top: coords.top, left: coords.left }}
              onMouseEnter={show}
              onMouseLeave={hide}
            >
              <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <div className="max-h-[min(22rem,70vh)] space-y-0.5 overflow-y-auto px-1.5">
                {children}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

export function NavSection({
  collapsed,
  icon: Icon,
  label,
  open,
  onToggle,
  sectionActive,
  children,
}: {
  collapsed: boolean
  icon: LucideIcon
  label: string
  open: boolean
  onToggle: () => void
  sectionActive: boolean
  children: ReactNode
}) {
  return (
    <div className="mb-1 mt-1">
      {collapsed ? (
        <div className="hidden lg:block">
          <CollapsedSection icon={Icon} label={label} active={sectionActive}>
            {children}
          </CollapsedSection>
        </div>
      ) : null}
      <div className={collapsed ? 'lg:hidden' : undefined}>
        <button
          type="button"
          onClick={onToggle}
          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300"
        >
          <span className="flex items-center gap-2 truncate">
            <Icon className="h-4 w-4 shrink-0 text-teal-500/90" />
            {label}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${
              open ? 'rotate-0' : '-rotate-90'
            }`}
          />
        </button>
        {open ? (
          <div className="ml-1 space-y-0.5 border-l border-slate-700/80 pl-2">{children}</div>
        ) : null}
      </div>
    </div>
  )
}
