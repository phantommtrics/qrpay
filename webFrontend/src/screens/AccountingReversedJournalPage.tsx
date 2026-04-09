import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { SearchableSelect, type SearchableSelectOption } from '../components/ui/SearchableSelect'
import { APP_PATHS, accountingReversedJournalDetailPath } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import {
  fetchJournalEntriesPage,
  JOURNAL_SOURCE_FILTER_OPTIONS,
  type JournalEntriesPageResult,
} from '../services/journalApi'
import { formatMoney } from '../utils/formatMoney'
import { localCalendarIsoDate } from '../utils/localCalendarDate'

const PAGE_SIZE = 20

const QB_SELECT_FORM =
  '!rounded-sm !border-qb-border !px-3 !py-2 !text-sm !font-normal !text-qb-heading !shadow-sm focus:!border-qb-primary focus:!ring-1 focus:!ring-qb-primary/35'
const QB_DROPDOWN = '!rounded-md !border-qb-border'
const TYPE_LIST_MAX = 'max-h-[11rem]'

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString()
}

export function AccountingReversedJournalPage() {
  const navigate = useNavigate()
  const { canAccess, currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const allowed = canAccess('accounting.journals.reversal')

  const [draftStart, setDraftStart] = useState(() => localCalendarIsoDate())
  const [draftEnd, setDraftEnd] = useState(() => localCalendarIsoDate())
  const [draftType, setDraftType] = useState('')
  const [appliedStart, setAppliedStart] = useState(() => localCalendarIsoDate())
  const [appliedEnd, setAppliedEnd] = useState(() => localCalendarIsoDate())
  const [appliedType, setAppliedType] = useState('')
  const [page, setPage] = useState(1)

  const [result, setResult] = useState<JournalEntriesPageResult | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    if (!businessId || !allowed) return
    setLoading(true)
    void fetchJournalEntriesPage(businessId, {
      page,
      pageSize: PAGE_SIZE,
      startDate: appliedStart.trim() || undefined,
      endDate: appliedEnd.trim() || undefined,
      sourceType: appliedType.trim() || undefined,
    })
      .then(setResult)
      .catch(() => setResult(null))
      .finally(() => setLoading(false))
  }, [businessId, allowed, page, appliedStart, appliedEnd, appliedType])

  useEffect(() => {
    load()
  }, [load])

  const applyFilters = () => {
    setAppliedStart(draftStart)
    setAppliedEnd(draftEnd)
    setAppliedType(draftType)
    setPage(1)
  }

  const clearFilters = () => {
    setDraftStart('')
    setDraftEnd('')
    setDraftType('')
    setAppliedStart('')
    setAppliedEnd('')
    setAppliedType('')
    setPage(1)
  }

  if (!businessId) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-500">Select a business.</p>
        </PageCard>
      </PageTransition>
    )
  }

  if (!allowed) {
    return (
      <PageTransition>
        <PageCard variant="plain" className="py-16">
          <p className="text-slate-600">Your plan does not include reversed journal access.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const fieldInput =
    'w-full rounded-sm border border-qb-border bg-white px-3 py-2 text-sm text-qb-heading placeholder:text-qb-muted/60 focus:border-qb-primary focus:outline-none focus:ring-1 focus:ring-qb-primary/35'

  const journalTypeOptions = useMemo<SearchableSelectOption[]>(
    () => JOURNAL_SOURCE_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
    [],
  )

  const totalPages = result?.totalPages ?? 1
  const canPrev = page > 1
  const canNext = page < totalPages

  return (
    <PageTransition>
      <div className="space-y-5 py-2 lg:space-y-6">
        <PageCard
          variant="default"
          className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <Link
            to={APP_PATHS.accounting}
            className="inline-flex items-center text-sm font-medium text-qb-muted hover:text-qb-heading"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-qb-heading">Reversed journal</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-qb-muted">
              Find a posted journal by date range and type, then open it to preview lines and post a
              reversal (debits and credits swapped). Entries linked to sales invoices, bills, or POS
              sales cannot be reversed here.
            </p>
          </div>
        </PageCard>

        <PageCard
          variant="default"
          className="space-y-4 rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Filters</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                Start date
              </span>
              <input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                className={fieldInput}
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
                End date
              </span>
              <input
                type="date"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
                className={fieldInput}
              />
            </label>
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-qb-muted">Type</span>
              <div className="mt-1">
                <SearchableSelect
                  value={draftType}
                  onChange={setDraftType}
                  options={journalTypeOptions}
                  placeholder="All types"
                  emptyMessage="No types"
                  noResultsMessage="No matching type"
                  ariaLabel="Journal source type"
                  buttonClassName={QB_SELECT_FORM}
                  listMaxHeightClass={TYPE_LIST_MAX}
                  dropdownClassName={QB_DROPDOWN}
                  matchOptionValue
                  listWindowInitial={4}
                  listWindowStep={4}
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="rounded-sm border border-qb-border bg-white px-4 py-2 text-sm font-semibold text-qb-heading shadow-sm hover:bg-qb-surface"
            >
              Apply filters
            </button>
            <button
              type="button"
              onClick={() => clearFilters()}
              className="rounded-sm border border-transparent px-4 py-2 text-sm font-medium text-qb-muted hover:text-qb-heading"
            >
              Clear
            </button>
          </div>
        </PageCard>

        <PageCard
          variant="default"
          className="rounded-md border-qb-border p-5 shadow-[0_1px_2px_rgba(57,58,61,0.08)]"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-qb-muted">
              Journal entries
            </p>
            {result != null ? (
              <p className="text-sm text-qb-muted">
                {result.total === 0
                  ? 'No entries'
                  : `Showing ${(page - 1) * result.pageSize + 1}–${Math.min(page * result.pageSize, result.total)} of ${result.total}`}
              </p>
            ) : null}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-qb-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : !result || result.entries.length === 0 ? (
            <p className="text-sm text-qb-muted">No journal entries match your filters.</p>
          ) : (
            <>
              <div className="overflow-x-auto rounded-sm border border-qb-border">
                <table className="w-full min-w-[880px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-qb-border bg-qb-surface text-xs font-semibold uppercase tracking-wide text-qb-muted">
                      <th className="px-3 py-2.5">Posted</th>
                      <th className="px-3 py-2.5">Source</th>
                      <th className="px-3 py-2.5">Lines</th>
                      <th className="px-3 py-2.5 text-right">Total Dr</th>
                      <th className="px-3 py-2.5 text-right">Total Cr</th>
                      <th className="px-3 py-2.5">Memo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-qb-border">
                    {result.entries.map((r) => {
                      const isRev = Boolean(r.reversesJournalEntryId)
                      return (
                        <tr
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(accountingReversedJournalDetailPath(r.id))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              navigate(accountingReversedJournalDetailPath(r.id))
                            }
                          }}
                          className="cursor-pointer align-top hover:bg-qb-surface/50 focus:bg-qb-surface/50 focus:outline-none"
                        >
                          <td className="px-3 py-2 tabular-nums text-qb-muted">
                            {formatShortDate(r.postedAt)}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-qb-heading">
                            {r.sourceType ?? '—'}
                            {isRev ? (
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                                reversal
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-qb-muted">{r.lineCount}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-qb-heading">
                            {formatMoney(r.totalDebit, { decimals: 2 })}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-qb-heading">
                            {formatMoney(r.totalCredit, { decimals: 2 })}
                          </td>
                          <td className="max-w-[260px] px-3 py-2 text-xs text-qb-muted">
                            <span className="line-clamp-2">{r.memo ?? '—'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-qb-border pt-4">
                <p className="text-sm text-qb-muted">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canPrev || loading}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-sm font-medium text-qb-heading shadow-sm hover:bg-qb-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={!canNext || loading}
                    onClick={() => setPage((p) => p + 1)}
                    className="inline-flex items-center gap-1 rounded-sm border border-qb-border bg-white px-3 py-1.5 text-sm font-medium text-qb-heading shadow-sm hover:bg-qb-surface disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </PageCard>
      </div>
    </PageTransition>
  )
}
