import { forwardRef } from 'react'
import QRCode from 'react-qr-code'
import { QrCode as QrCodeIcon } from 'lucide-react'

export type TableGuestTentCardProps = {
  businessName: string
  /** Used when `businessName` is empty — readable title from the URL slug. */
  businessSlug?: string
  tableLabel: string
  menuUrl: string
  isInactive?: boolean
  /** Wide layout: branding and table on the left, QR on the right. */
  layout?: 'portrait' | 'landscape'
}

function humanizeSlug(slug: string): string {
  return slug
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

function resolveBusinessDisplayName(name: string, slug?: string): string {
  const trimmed = name.trim()
  if (trimmed) return trimmed
  const s = slug?.trim()
  if (s) return humanizeSlug(s)
  return 'Your business'
}

function FloralBackdrop() {
  const stroke = 'rgba(13, 148, 136, 0.28)'
  const fillSoft = 'rgba(16, 185, 129, 0.13)'
  const fillPetal = 'rgba(13, 148, 136, 0.12)'

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" aria-hidden>
      <svg
        className="absolute -left-8 -top-10 h-44 w-44 text-teal-600/90 opacity-[0.78] print:opacity-88"
        viewBox="0 0 160 160"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1.2">
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <ellipse
              key={deg}
              cx="80"
              cy="48"
              rx="14"
              ry="26"
              fill={fillPetal}
              transform={`rotate(${deg} 80 80)`}
            />
          ))}
          <circle cx="80" cy="80" r="10" fill={fillSoft} stroke="none" />
        </g>
        <path
          d="M118 112c12-8 22-4 28 6M34 124c-10-14-4-28 8-36"
          stroke={stroke}
          strokeWidth="1.08"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      <svg
        className="absolute -right-10 -top-6 h-40 w-40 rotate-12 opacity-[0.72] print:opacity-82"
        viewBox="0 0 160 160"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1.2">
          {[30, 90, 150, 210, 270, 330].map((deg) => (
            <ellipse
              key={deg}
              cx="80"
              cy="46"
              rx="12"
              ry="24"
              fill={fillPetal}
              transform={`rotate(${deg} 80 80)`}
            />
          ))}
          <circle cx="80" cy="80" r="8" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg
        className="absolute left-1/2 top-5 h-[4.5rem] w-[4.5rem] -translate-x-1/2 opacity-[0.58] print:opacity-68"
        viewBox="0 0 100 100"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse
              key={deg}
              cx="50"
              cy="32"
              rx="9"
              ry="16"
              fill={fillPetal}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          <circle cx="50" cy="50" r="6" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg
        className="absolute -left-5 top-[30%] h-36 w-36 -rotate-[18deg] opacity-[0.54] print:opacity-64"
        viewBox="0 0 120 120"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1">
          {[15, 75, 135, 195, 255, 315].map((deg) => (
            <ellipse
              key={deg}
              cx="60"
              cy="40"
              rx="11"
              ry="20"
              fill={fillPetal}
              transform={`rotate(${deg} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="7" fill={fillSoft} stroke="none" />
        </g>
        <path
          d="M95 88c8 10 4 22-6 28M18 72Q28 58 38 70"
          stroke={stroke}
          strokeWidth="0.95"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      <svg
        className="absolute -right-4 top-[34%] h-[7.5rem] w-[7.5rem] rotate-[22deg] opacity-[0.52] print:opacity-62"
        viewBox="0 0 120 120"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1">
          {[0, 60, 120, 180, 240, 300].map((deg) => (
            <ellipse
              key={deg}
              cx="60"
              cy="38"
              rx="10"
              ry="19"
              fill={fillPetal}
              transform={`rotate(${deg} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="6" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg
        className="absolute left-[12%] top-[48%] h-14 w-14 opacity-[0.48] print:opacity-58"
        viewBox="0 0 64 64"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="0.9">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse
              key={deg}
              cx="32"
              cy="20"
              rx="6"
              ry="11"
              fill={fillPetal}
              transform={`rotate(${deg} 32 32)`}
            />
          ))}
          <circle cx="32" cy="32" r="4" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg
        className="absolute right-[10%] top-[52%] h-16 w-16 rotate-45 opacity-[0.46] print:opacity-56"
        viewBox="0 0 64 64"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="0.85">
          {[36, 108, 180, 252, 324].map((deg) => (
            <ellipse
              key={deg}
              cx="32"
              cy="19"
              rx="5.5"
              ry="10"
              fill={fillPetal}
              transform={`rotate(${deg} 32 32)`}
            />
          ))}
          <circle cx="32" cy="32" r="3.5" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg
        className="absolute -bottom-7 left-1/2 h-32 w-[min(100%,24rem)] -translate-x-1/2 opacity-[0.58] print:opacity-68"
        viewBox="0 0 380 100"
        fill="none"
      >
        {[
          { tx: 28, ty: 50, sc: 0.52 },
          { tx: 88, ty: 48, sc: 0.88 },
          { tx: 160, ty: 46, sc: 1 },
          { tx: 232, ty: 48, sc: 0.88 },
          { tx: 292, ty: 50, sc: 0.52 },
          { tx: 350, ty: 52, sc: 0.45 },
        ].map(({ tx, ty, sc }) => (
          <g key={`g-${tx}`} transform={`translate(${tx} ${ty}) scale(${sc})`} stroke={stroke} strokeWidth="1.08">
            {[0, 72, 144, 216, 288].map((deg) => (
              <ellipse
                key={deg}
                cx="0"
                cy="-16"
                rx="10"
                ry="18"
                fill={fillPetal}
                transform={`rotate(${deg})`}
              />
            ))}
            <circle cx="0" cy="0" r="7" fill={fillSoft} stroke="none" />
          </g>
        ))}
      </svg>

      <svg
        className="absolute bottom-24 -right-4 h-32 w-32 -rotate-6 opacity-[0.62] print:opacity-72"
        viewBox="0 0 120 120"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse
              key={deg}
              cx="60"
              cy="38"
              rx="10"
              ry="18"
              fill={fillPetal}
              transform={`rotate(${deg} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="7" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg
        className="absolute bottom-[5.5rem] -left-4 h-[7.25rem] w-[7.25rem] rotate-[10deg] opacity-[0.6] print:opacity-70"
        viewBox="0 0 120 120"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="1">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse
              key={deg}
              cx="60"
              cy="38"
              rx="10"
              ry="18"
              fill={fillPetal}
              transform={`rotate(${deg} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="7" fill={fillSoft} stroke="none" />
        </g>
        <path
          d="M88 96c10-6 18-2 24 6M12 88q14-18 28-8"
          stroke={stroke}
          strokeWidth="0.95"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      <svg
        className="absolute bottom-[42%] left-1/2 h-20 w-20 -translate-x-1/2 opacity-[0.42] print:opacity-54"
        viewBox="0 0 80 80"
        fill="none"
      >
        <g stroke={stroke} strokeWidth="0.9">
          {[0, 72, 144, 216, 288].map((deg) => (
            <ellipse
              key={deg}
              cx="40"
              cy="24"
              rx="7"
              ry="13"
              fill={fillPetal}
              transform={`rotate(${deg} 40 40)`}
            />
          ))}
          <circle cx="40" cy="40" r="5" fill={fillSoft} stroke="none" />
        </g>
      </svg>

      <svg className="absolute inset-0 opacity-[0.32] print:opacity-44" viewBox="0 0 400 560" fill="none" preserveAspectRatio="xMidYMid meet">
        <path
          d="M-8 120 Q24 100 48 132 Q62 158 40 188M408 200 Q372 176 348 210 Q330 242 356 272M32 420 Q58 398 72 432 Q64 462 38 478M372 420 Q348 402 324 428"
          stroke={stroke}
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M12 280 Q40 268 52 296 M356 320 Q328 308 312 336 M196 520 Q220 500 240 528"
          stroke={stroke}
          strokeWidth="0.78"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  )
}

function CardCornerBrackets() {
  const bracket = (className: string) => (
    <svg
      className={`pointer-events-none absolute h-9 w-9 text-teal-800/30 print:h-10 print:w-10 print:text-teal-900/35 ${className}`}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden
    >
      <path d="M4 14V4h10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <path d="M7 11V7h4" stroke="currentColor" strokeWidth="0.65" strokeLinecap="round" opacity="0.55" />
    </svg>
  )

  return (
    <>
      {bracket('left-1 top-1')}
      {bracket('right-1 top-1 scale-x-[-1]')}
      {bracket('left-1 bottom-1 scale-y-[-1]')}
      {bracket('right-1 bottom-1 scale-x-[-1] scale-y-[-1]')}
    </>
  )
}

/**
 * Print-ready table tent: clear hierarchy, soft vector florals, legible at arm’s length.
 */
export const TableGuestTentCard = forwardRef<HTMLDivElement, TableGuestTentCardProps>(
  function TableGuestTentCard(
    { businessName, businessSlug, tableLabel, menuUrl, isInactive, layout = 'portrait' },
    ref,
  ) {
    const displayBusinessName = resolveBusinessDisplayName(businessName, businessSlug)
    const isLandscape = layout === 'landscape'

    const shellClass = [
      'table-guest-tent-card relative mx-auto w-full overflow-hidden rounded-[1.35rem] border border-slate-200/90 bg-white text-slate-900 antialiased',
      isLandscape ? 'max-w-[42rem]' : 'max-w-md',
      'shadow-[0_2px_0_rgba(15,23,42,0.03),0_24px_48px_-12px_rgba(15,23,42,0.14)]',
      'ring-1 ring-slate-900/[0.04]',
      'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.028)_1px,transparent_0)] before:bg-[length:20px_20px]',
      isLandscape
        ? 'print:max-w-[42rem] print:rounded-2xl print:border-slate-300 print:shadow-none print:ring-0 print:before:hidden'
        : 'print:max-w-[360px] print:rounded-2xl print:border-slate-300 print:shadow-none print:ring-0 print:before:hidden',
      'print:break-inside-avoid',
    ].join(' ')

    return (
      <div ref={ref} className={shellClass}>
        <FloralBackdrop />

        <div
          className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-[radial-gradient(ellipse_88%_72%_at_50%_44%,transparent_0%,rgba(255,255,255,0.16)_52%,rgba(248,250,252,0.55)_100%)] print:bg-[radial-gradient(ellipse_92%_78%_at_50%_46%,transparent_0%,rgba(255,255,255,0.12)_48%,rgba(255,255,255,0.48)_100%)]"
          aria-hidden
        />

        <div
          className="absolute inset-x-0 top-0 z-[2] h-[3px] bg-gradient-to-r from-teal-950 via-teal-700 to-emerald-700"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 top-[3px] z-[2] h-px bg-gradient-to-r from-white/25 via-transparent to-white/20"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 top-[4px] z-[2] h-[2px] bg-gradient-to-r from-amber-100/0 via-amber-200/40 to-amber-100/0 print:via-amber-200/55"
          aria-hidden
        />

        {isLandscape ? (
          <div className="relative z-10 flex flex-row items-center gap-8 px-8 py-8 text-left print:px-9 print:py-9">
            <CardCornerBrackets />
            <div className="min-w-0 flex-1 space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.85rem] bg-gradient-to-br from-slate-800 to-slate-950 text-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.45)] ring-1 ring-white/10">
                  <QrCodeIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 border-b border-teal-100/80 pb-3">
                  <p className="text-[0.6rem] font-medium tracking-[0.26em] text-teal-800/85 uppercase">
                    Order from this table
                  </p>
                  <h2 className="mt-1 font-serif text-[1.45rem] font-semibold leading-snug tracking-tight text-slate-950">
                    {displayBusinessName}
                  </h2>
                  <p className="mt-1.5 text-[0.65rem] font-medium tracking-[0.2em] text-slate-500 uppercase">
                    Scan · Browse · Order
                  </p>
                </div>
              </div>

              <div className="inline-block w-full max-w-[13rem] rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 to-white px-5 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-slate-900/[0.03]">
                <p className="text-[0.625rem] font-medium tracking-[0.26em] text-slate-500 uppercase">Table</p>
                <p className="mt-1 text-[1.85rem] font-semibold tabular-nums tracking-tight text-slate-950">
                  {tableLabel}
                </p>
                {isInactive ? (
                  <p className="mt-2 text-[0.7rem] font-medium tracking-wide text-amber-800">
                    Inactive — do not use
                  </p>
                ) : null}
              </div>

              <div className="border-t border-slate-200/80 pt-4">
                <p className="text-[0.6rem] font-medium tracking-[0.24em] text-slate-500 uppercase">Powered by</p>
                <p className="mt-1 bg-gradient-to-r from-teal-800 to-emerald-800 bg-clip-text text-sm font-semibold tracking-tight text-transparent print:bg-none print:text-teal-900">
                  EASYPAY
                </p>
              </div>
            </div>

            <div className="relative flex shrink-0 flex-col items-center justify-center">
              <div
                className="absolute -inset-2 rounded-[1.25rem] border border-slate-200/60 bg-slate-50/40"
                aria-hidden
              />
              <div
                data-table-tent-qr
                className="relative inline-flex rounded-2xl border border-slate-300/80 bg-white p-3 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06),0_1px_0_rgba(255,255,255,0.9)]"
              >
                <QRCode value={menuUrl} size={200} level="H" />
              </div>
            </div>
          </div>
        ) : (
          <div className="relative z-10 px-9 pb-11 pt-10 text-center print:px-10 print:pb-12 print:pt-11">
            <CardCornerBrackets />
            <div className="mx-auto mb-7 flex h-12 w-12 items-center justify-center rounded-[0.9rem] bg-gradient-to-br from-slate-800 to-slate-950 text-white shadow-[0_8px_24px_-6px_rgba(15,23,42,0.45)] ring-1 ring-white/10 print:mb-8 print:h-[3.25rem] print:w-[3.25rem]">
              <QrCodeIcon className="h-[1.35rem] w-[1.35rem] print:h-6 print:w-6" strokeWidth={2} aria-hidden />
            </div>

            <div className="relative mx-auto max-w-[17.5rem] rounded-2xl border border-teal-100/90 bg-gradient-to-b from-teal-50/85 via-white/90 to-white/95 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_28px_-16px_rgba(13,148,136,0.25)] ring-1 ring-teal-900/[0.04] print:max-w-[18rem] print:py-6">
              <p className="text-[0.625rem] font-medium tracking-[0.28em] text-teal-800/85 uppercase">
                Order from this table
              </p>
              <h2 className="mt-2.5 font-serif text-[1.65rem] font-semibold leading-snug tracking-tight text-slate-950 print:text-[1.85rem]">
                {displayBusinessName}
              </h2>
              <p className="mt-2 text-[0.7rem] font-medium tracking-[0.2em] text-slate-500 uppercase">
                Scan · Browse · Order
              </p>
            </div>

            <div className="relative my-8 print:my-9">
              <div
                className="mb-5 flex items-center justify-center gap-3 print:mb-6"
                aria-hidden
              >
                <div className="h-px max-w-[5rem] flex-1 bg-gradient-to-r from-transparent to-slate-200/90 print:max-w-[5.5rem]" />
                <div className="flex h-7 w-7 shrink-0 items-center justify-center">
                  <div className="h-2 w-2 rotate-45 rounded-[1px] border border-teal-300/60 bg-gradient-to-br from-teal-50/95 to-emerald-50/80 shadow-[0_0_0_1px_rgba(255,255,255,0.8)_inset]" />
                </div>
                <div className="h-px max-w-[5rem] flex-1 bg-gradient-to-l from-transparent to-slate-200/90 print:max-w-[5.5rem]" />
              </div>
              <div className="relative mx-auto max-w-[14rem] rounded-2xl border border-slate-200/90 bg-gradient-to-b from-slate-50/90 to-white px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-slate-900/[0.03] print:max-w-[15rem] print:py-6">
                <p className="text-[0.625rem] font-medium tracking-[0.26em] text-slate-500 uppercase">Table</p>
                <p className="mt-1.5 text-[2rem] font-semibold tabular-nums tracking-tight text-slate-950 print:text-[2.35rem]">
                  {tableLabel}
                </p>
                {isInactive ? (
                  <p className="mt-2.5 text-[0.7rem] font-medium tracking-wide text-amber-800">
                    Inactive — do not use
                  </p>
                ) : null}
              </div>
            </div>

            <div className="relative mx-auto inline-flex">
              <div
                className="absolute -inset-3 rounded-[1.35rem] border border-slate-200/60 bg-slate-50/40 print:-inset-2"
                aria-hidden
              />
              <div
                data-table-tent-qr
                className="relative inline-flex rounded-2xl border border-slate-300/80 bg-white p-[0.85rem] shadow-[inset_0_1px_2px_rgba(15,23,42,0.06),0_1px_0_rgba(255,255,255,0.9)] print:p-4"
              >
                <QRCode value={menuUrl} size={216} level="H" />
              </div>
            </div>

            <div className="mt-8 flex flex-col items-center border-t border-slate-200/80 pt-7 print:mt-9 print:pt-8">
              <div className="mb-3 flex w-full max-w-[11rem] items-center gap-2 print:max-w-[12rem]" aria-hidden>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-200/70" />
                <div className="h-1 w-1 shrink-0 rotate-45 bg-teal-600/25 print:bg-teal-800/35" />
                <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-200/70" />
              </div>
              <p className="text-[0.6rem] font-medium tracking-[0.24em] text-slate-500 uppercase">Powered by</p>
              <p className="mt-1.5 bg-gradient-to-r from-teal-800 to-emerald-800 bg-clip-text text-base font-semibold tracking-tight text-transparent print:bg-none print:text-teal-900">
                EASYPAY
              </p>
            </div>
          </div>
        )}
      </div>
    )
  },
)

TableGuestTentCard.displayName = 'TableGuestTentCard'
