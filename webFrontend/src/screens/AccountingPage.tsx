import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowRight,
  BanknoteArrowUp,
  BookOpenText,
  ChartNoAxesCombined,
  Wallet,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { formatMoney } from '../utils/formatMoney'
import {
  calculateProfitLoss,
  getCashBalancesForBusiness,
  getOverallCashBalance,
  getProfitLossSnapshotForBusiness,
  getProfitLossTrendForBusiness,
  summarizeTrend,
} from '../utils/accounting'

export function AccountingPage() {
  const navigate = useNavigate()
  const { user, canAccess, currentOrganization, currentPlan } = useAuth()
  const businessId = user?.businessId
  const cashBalances = getCashBalancesForBusiness(businessId)
  const profitLossSnapshot = getProfitLossSnapshotForBusiness(businessId)
  const trend = summarizeTrend(getProfitLossTrendForBusiness(businessId))
  const canOpenChartOfAccounts = canAccess('accounting.chart.view')
  const overallCashBalance = getOverallCashBalance(cashBalances)
  const balancesSummary = `${cashBalances.length} account${cashBalances.length === 1 ? '' : 's'}`

  if (!profitLossSnapshot) {
    return (
      <PageTransition className="space-y-6">
        <PageCard className="p-8">
          <h2 className="text-2xl font-bold text-slate-900">Accounting</h2>
          <p className="mt-3 text-slate-600">
            No accounting data is available for this organization yet.
          </p>
        </PageCard>
      </PageTransition>
    )
  }

  const profitLoss = calculateProfitLoss(profitLossSnapshot)

  return (
    <PageTransition className="space-y-6">
      <PageCard className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-teal-600">
              Accounting Dashboard
            </p>
            <h2 className="mt-2 text-2xl font-bold text-slate-900">
              {currentOrganization?.name ?? 'Business'} financial overview
            </h2>
            <p className="mt-2 max-w-3xl text-slate-600">
              A Xero-style starting point for balances, profitability, and account controls.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">
            {currentPlan?.name ?? 'Current'} plan
          </div>
        </div>
      </PageCard>

      <div className="grid gap-6 xl:grid-cols-3">
        <button
          onClick={() => navigate(APP_PATHS.accountingBalances)}
          className="text-left"
        >
          <PageCard className="h-full p-6 transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Consolidated cash value</p>
                <h3 className="mt-3 text-3xl font-bold text-slate-900">
                  {formatMoney(overallCashBalance, { decimals: 0 })}
                </h3>
              </div>
              <div className="rounded-2xl bg-teal-50 p-3 text-teal-600">
                <Wallet className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Combined view of all merchant and bank accounts.
            </p>
            <div className="mt-5 flex items-center justify-between text-sm font-medium text-teal-700">
              <span>{balancesSummary}</span>
              <span className="inline-flex items-center">
                Open balances
                <ArrowRight className="ml-1 h-4 w-4" />
              </span>
            </div>
          </PageCard>
        </button>

        <button
          onClick={() => navigate(APP_PATHS.accountingProfitLoss)}
          className="text-left"
        >
          <PageCard className="h-full p-6 transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Profit or Loss</p>
                <h3 className="mt-3 text-3xl font-bold text-slate-900">
                  {formatMoney(profitLoss.netProfit, { decimals: 0 })}
                </h3>
              </div>
              <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600">
                <ChartNoAxesCombined className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Calculated as income minus cost of goods sold minus operating expenses.
            </p>
            <div className="mt-5 flex items-center justify-between text-sm font-medium text-indigo-700">
              <span>Gross profit {formatMoney(profitLoss.grossProfit, { decimals: 0 })}</span>
              <span className="inline-flex items-center">
                Open P&amp;L
                <ArrowRight className="ml-1 h-4 w-4" />
              </span>
            </div>
          </PageCard>
        </button>

        <button
          onClick={() => {
            if (canOpenChartOfAccounts) {
              navigate(APP_PATHS.accountingChart)
            }
          }}
          className="text-left disabled:cursor-not-allowed"
          disabled={!canOpenChartOfAccounts}
        >
          <PageCard
            className={`h-full p-6 transition-all ${
              canOpenChartOfAccounts
                ? 'hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md'
                : 'bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Chart of accounts</p>
                <h3 className="mt-3 text-3xl font-bold text-slate-900">
                  {canOpenChartOfAccounts ? 'Live controls' : 'Business Pro'}
                </h3>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                <BookOpenText className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-500">
              Receive, send, transfer, and inspect transactions across accounts.
            </p>
            <div className="mt-5 flex items-center justify-between text-sm font-medium text-amber-700">
              <span>{canOpenChartOfAccounts ? 'Full access enabled' : 'Upgrade required'}</span>
              <span className="inline-flex items-center">
                {canOpenChartOfAccounts ? 'Open controls' : 'Locked'}
                {canOpenChartOfAccounts ? <ArrowRight className="ml-1 h-4 w-4" /> : null}
              </span>
            </div>
          </PageCard>
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <PageCard className="p-6">
          <PageSectionHeader title="Profitability Trend" className="mb-6" />
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="dashboardIncomeFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#64748B', fontSize: 12 }}
                  tickFormatter={(value) => `D${value}`}
                />
                <Tooltip
                  formatter={(value) => formatMoney(Number(value), { decimals: 0 })}
                  contentStyle={{
                    border: 'none',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="grossProfit"
                  stroke="#0D9488"
                  strokeWidth={3}
                  fill="url(#dashboardIncomeFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </PageCard>

        <PageCard className="p-6">
          <PageSectionHeader title="At a Glance" className="mb-6" />
          <div className="space-y-4">
            {[
              {
                label: 'Income',
                value: profitLoss.income,
                tone: 'text-emerald-700',
                icon: BanknoteArrowUp,
              },
              {
                label: 'Cost of goods sold',
                value: profitLoss.costOfGoodsSold,
                tone: 'text-amber-700',
                icon: Wallet,
              },
              {
                label: 'Gross profit',
                value: profitLoss.grossProfit,
                tone: 'text-teal-700',
                icon: ChartNoAxesCombined,
              },
              {
                label: 'Operating expenses',
                value: profitLoss.operatingExpenses,
                tone: 'text-rose-700',
                icon: BookOpenText,
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-white p-2 text-slate-600 shadow-sm">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium text-slate-600">{item.label}</span>
                </div>
                <span className={`text-sm font-semibold ${item.tone}`}>
                  {formatMoney(item.value, { decimals: 0 })}
                </span>
              </div>
            ))}
          </div>
        </PageCard>
      </div>
    </PageTransition>
  )
}
