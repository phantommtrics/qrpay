import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRightLeft,
  BanknoteArrowDown,
  BanknoteArrowUp,
  BookOpenText,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { PageCard } from '../components/ui/PageCard'
import { PageSectionHeader } from '../components/ui/PageSectionHeader'
import { PageTransition } from '../components/ui/PageTransition'
import { APP_PATHS } from '../config/navigation'
import { useAuth } from '../features/auth/AuthContext'
import { formatMoney } from '../utils/formatMoney'
import {
  buildProjectedBalances,
  getAccountingTransactionsForBusiness,
  getCashBalancesForBusiness,
  getChartAccountsForBusiness,
  resolveAccountingAccountName,
} from '../utils/accounting'
import type { AccountingTransaction } from '../types'

type EntryAction = AccountingTransaction['type']

export function AccountingChartAccountsPage() {
  const { currentOrganization } = useAuth()
  const businessId = currentOrganization?.id
  const baseCashAccounts = getCashBalancesForBusiness(businessId)
  const baseChartAccounts = getChartAccountsForBusiness(businessId)
  const [transactions, setTransactions] = useState<AccountingTransaction[]>(
    getAccountingTransactionsForBusiness(businessId),
  )
  const [form, setForm] = useState({
    type: 'transfer' as EntryAction,
    amount: 0,
    fromAccountId: baseCashAccounts[0]?.id ?? baseChartAccounts[0]?.id ?? '',
    toAccountId: baseChartAccounts[0]?.id ?? baseCashAccounts[0]?.id ?? '',
    description: '',
  })
  const [error, setError] = useState<string | null>(null)

  const projected = useMemo(
    () => buildProjectedBalances(baseCashAccounts, baseChartAccounts, transactions),
    [baseCashAccounts, baseChartAccounts, transactions],
  )
  const allAccounts = [...projected.cashAccounts, ...projected.chartAccounts]
  const groupedAccounts = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'].map(
    (category) => ({
      category,
      accounts: projected.chartAccounts.filter((account) => account.category === category),
      total: projected.chartAccounts
        .filter((account) => account.category === category)
        .reduce((sum, account) => sum + account.balance, 0),
    }),
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (form.amount <= 0) {
      setError('Enter a valid amount.')
      return
    }

    if (form.type !== 'receive' && !form.fromAccountId) {
      setError('Select the account the money is coming from.')
      return
    }

    if (!form.toAccountId) {
      setError('Select the destination account.')
      return
    }

    if (
      (form.type === 'transfer' || form.type === 'send') &&
      form.fromAccountId === form.toAccountId
    ) {
      setError('Source and destination accounts must be different.')
      return
    }

    const nextTransaction: AccountingTransaction = {
      id: `txn-${Date.now()}`,
      businessId: businessId ?? 'unknown',
      type: form.type,
      amount: form.amount,
      fromAccountId: form.type === 'receive' ? undefined : form.fromAccountId,
      toAccountId: form.toAccountId,
      reference: `${form.type.toUpperCase()}-${Date.now().toString().slice(-6)}`,
      description: form.description.trim() || 'Manual accounting entry',
      createdAt: new Date().toISOString(),
    }

    setTransactions((current) => [nextTransaction, ...current])
    setForm((current) => ({
      ...current,
      amount: 0,
      description: '',
    }))
  }

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
        <h2 className="mt-4 text-2xl font-bold text-slate-900">Chart of accounts controls</h2>
        <p className="mt-2 max-w-3xl text-slate-600">
          Receive, send, or transfer money across your chart of accounts and cash accounts, then
          review the resulting transactions.
        </p>
      </PageCard>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <PageCard className="p-6">
          <PageSectionHeader title="Create accounting entry" className="mb-6" />
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">Entry type</span>
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    type: event.target.value as EntryAction,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              >
                <option value="receive">Receive money</option>
                <option value="send">Send money</option>
                <option value="transfer">Transfer money</option>
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Amount</span>
                <input
                  type="number"
                  min={0}
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amount: Number(event.target.value) || 0,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">Description</span>
                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                />
              </label>
            </div>

            {form.type !== 'receive' ? (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-700">From account</span>
                <select
                  value={form.fromAccountId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, fromAccountId: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
                >
                  {allAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({formatMoney(account.balance, { decimals: 0 })})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-slate-700">To account</span>
              <select
                value={form.toAccountId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, toAccountId: event.target.value }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none focus:border-teal-500"
              >
                {allAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({formatMoney(account.balance, { decimals: 0 })})
                  </option>
                ))}
              </select>
            </label>

            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <button className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800">
              {form.type === 'receive' ? (
                <BanknoteArrowUp className="mr-2 h-4 w-4" />
              ) : form.type === 'send' ? (
                <BanknoteArrowDown className="mr-2 h-4 w-4" />
              ) : (
                <ArrowRightLeft className="mr-2 h-4 w-4" />
              )}
              Post transaction
            </button>
          </form>
        </PageCard>

        <div className="space-y-6">
          <PageCard className="p-6">
            <PageSectionHeader title="Chart account categories" className="mb-6" />
            <div className="space-y-4">
              {groupedAccounts.map((group) => (
                <div key={group.category} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{group.category}</span>
                    <span className="text-sm font-medium text-slate-500">
                      {formatMoney(group.total, { decimals: 0 })}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.accounts.map((account) => (
                      <div key={account.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-600">
                          {account.code} {account.name}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatMoney(account.balance, { decimals: 0 })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </PageCard>
        </div>
      </div>

      <PageCard className="overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Transactions report</h3>
              <p className="mt-1 text-sm text-slate-500">
                Live mock transaction trail for chart and cash accounts.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-2 text-slate-600">
              <BookOpenText className="h-5 w-5" />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-sm text-slate-500">
                <th className="p-4 font-medium">Reference</th>
                <th className="p-4 font-medium">Type</th>
                <th className="p-4 font-medium">From</th>
                <th className="p-4 font-medium">To</th>
                <th className="p-4 font-medium">Amount</th>
                <th className="p-4 font-medium">Description</th>
                <th className="p-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((transaction) => (
                <tr key={transaction.id} className="hover:bg-slate-50">
                  <td className="p-4 font-mono text-sm text-slate-600">{transaction.reference}</td>
                  <td className="p-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {transaction.type}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {resolveAccountingAccountName(
                      transaction.fromAccountId,
                      projected.cashAccounts,
                      projected.chartAccounts,
                    )}
                  </td>
                  <td className="p-4 text-sm text-slate-600">
                    {resolveAccountingAccountName(
                      transaction.toAccountId,
                      projected.cashAccounts,
                      projected.chartAccounts,
                    )}
                  </td>
                  <td className="p-4 font-semibold text-slate-900">
                    {formatMoney(transaction.amount, { decimals: 0 })}
                  </td>
                  <td className="p-4 text-sm text-slate-600">{transaction.description}</td>
                  <td className="p-4 text-sm text-slate-500">
                    {new Date(transaction.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageCard>
    </PageTransition>
  )
}
