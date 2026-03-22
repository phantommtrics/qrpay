import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { formatMoney } from '../utils/formatMoney'
import {
  calculateProfitLoss,
  getProfitLossAccountsForBusiness,
  getProfitLossSnapshotForBusiness,
  getProfitLossTrendForBusiness,
  summarizeTrend,
} from '../utils/accounting'

export function AccountingProfitLossPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const snapshot = getProfitLossSnapshotForBusiness(businessId)
  const trend = summarizeTrend(getProfitLossTrendForBusiness(businessId))
  const profitLossAccounts = getProfitLossAccountsForBusiness(businessId)

  if (!snapshot) {
    return (
      <PageTransition className="space-y-6">
        <PageCard className="p-8">
          <h2 className="text-2xl font-bold text-slate-900">Profit and loss</h2>
          <p className="mt-3 text-slate-600">No profit and loss data is available.</p>
        </PageCard>
      </PageTransition>
    )
  }

  const profitLoss = calculateProfitLoss(snapshot)

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-6">
        <Link
          to={APP_PATHS.accounting}
          className="inline-flex items-center text-sm font-medium text-teal-600 hover:text-teal-700"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to accounting dashboard
        </Link>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Profit and loss</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Formula view: total income minus cost of goods sold equals gross profit, then operating
          expenses are removed to arrive at profit or loss.
        </p>
      </PageCard>

      <PageCard className="p-6">
        <PageSectionHeader title="P&L Formula" className="mb-6" />
        <div className="space-y-4">
          <div className="rounded-2xl bg-emerald-50 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-800">Income</span>
              <TrendingUp className="h-5 w-5 text-emerald-600" />
            </div>
            <p className="mt-3 text-3xl font-bold text-emerald-900">
              {formatMoney(profitLoss.income, { decimals: 0 })}
            </p>
            <div className="mt-4 space-y-2">
              {profitLossAccounts.income.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-emerald-900">{account.name}</span>
                  <span className="font-semibold text-emerald-900">
                    {formatMoney(account.balance, { decimals: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center text-slate-400">
            <ArrowRight className="h-5 w-5" />
          </div>

          <div className="rounded-2xl bg-amber-50 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-amber-800">Cost of goods sold</span>
              <TrendingDown className="h-5 w-5 text-amber-600" />
            </div>
            <p className="mt-3 text-3xl font-bold text-amber-900">
              {formatMoney(profitLoss.costOfGoodsSold, { decimals: 0 })}
            </p>
            <div className="mt-4 space-y-2">
              {profitLossAccounts.costOfGoodsSold.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-amber-900">{account.name}</span>
                  <span className="font-semibold text-amber-900">
                    {formatMoney(account.balance, { decimals: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-teal-800">Gross profit</span>
              <Calculator className="h-5 w-5 text-teal-600" />
            </div>
            <p className="mt-3 text-3xl font-bold text-teal-900">
              {formatMoney(profitLoss.grossProfit, { decimals: 0 })}
            </p>
            <p className="mt-2 text-sm text-teal-700">
              {formatMoney(profitLoss.income, { decimals: 0 })} -{' '}
              {formatMoney(profitLoss.costOfGoodsSold, { decimals: 0 })}
            </p>
          </div>

          <div className="flex items-center justify-center text-slate-400">
            <ArrowRight className="h-5 w-5" />
          </div>

          <div className="rounded-2xl bg-rose-50 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-rose-800">Operating expenses</span>
              <TrendingDown className="h-5 w-5 text-rose-600" />
            </div>
            <p className="mt-3 text-3xl font-bold text-rose-900">
              {formatMoney(profitLoss.operatingExpenses, { decimals: 0 })}
            </p>
            <div className="mt-4 space-y-2">
              {profitLossAccounts.operatingExpenses.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-rose-900">{account.name}</span>
                  <span className="font-semibold text-rose-900">
                    {formatMoney(account.balance, { decimals: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-900 p-5 text-white">
            <p className="text-sm font-medium text-slate-300">Profit or loss</p>
            <p className="mt-3 text-4xl font-bold">
              {formatMoney(profitLoss.netProfit, { decimals: 0 })}
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {formatMoney(profitLoss.grossProfit, { decimals: 0 })} -{' '}
              {formatMoney(profitLoss.operatingExpenses, { decimals: 0 })}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4">
            <p className="text-sm font-medium text-slate-500">Recent gross profit trend</p>
            <div className="mt-4 space-y-3">
              {trend.map((point) => (
                <div key={point.period} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{point.period}</span>
                  <span className="font-semibold text-slate-900">
                    {formatMoney(point.grossProfit, { decimals: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageCard>
    </PageTransition>
  )
}
