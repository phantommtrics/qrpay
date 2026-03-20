import { ArrowLeft, Landmark, ReceiptText, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { formatMoney } from '../utils/formatMoney'
import { getCashBalancesForBusiness, getOverallCashBalance } from '../utils/accounting'

export function AccountingBalancesPage() {
  const { user } = useAuth()
  const balances = getCashBalancesForBusiness(user?.businessId)
  const consolidatedBalance = getOverallCashBalance(balances)

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
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Account balances</h2>
        <p className="mt-2 text-slate-600">
          Individual bank and merchant balances contributing to the consolidated cash value.
        </p>
      </PageCard>

      <div className="grid gap-6 md:grid-cols-3">
        <PageCard className="p-6 md:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Consolidated value</p>
              <h3 className="mt-3 text-4xl font-bold text-slate-900">
                {formatMoney(consolidatedBalance, { decimals: 0 })}
              </h3>
            </div>
            <div className="rounded-2xl bg-teal-50 p-3 text-teal-600">
              <Wallet className="h-8 w-8" />
            </div>
          </div>
        </PageCard>

        {balances.map((account) => (
          <PageCard key={account.id} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">
                  {account.type === 'bank' ? 'Bank account' : 'Merchant account'}
                </p>
                <h3 className="mt-3 text-3xl font-bold text-slate-900">
                  {formatMoney(account.balance, { decimals: 0 })}
                </h3>
              </div>
              <div
                className={`rounded-2xl p-3 ${
                  account.type === 'bank'
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'bg-amber-50 text-amber-600'
                }`}
              >
                {account.type === 'bank' ? (
                  <Landmark className="h-6 w-6" />
                ) : (
                  <ReceiptText className="h-6 w-6" />
                )}
              </div>
            </div>
            <p className="mt-4 text-sm font-medium text-slate-900">{account.name}</p>
            <p className="mt-2 text-xs text-slate-500">
              Updated {new Date(account.lastUpdatedAt).toLocaleString()}
            </p>
          </PageCard>
        ))}
      </div>
    </PageTransition>
  )
}
