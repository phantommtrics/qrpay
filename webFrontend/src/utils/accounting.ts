import {
  ACCOUNTING_TRANSACTIONS,
  CASH_ACCOUNT_BALANCES,
  CHART_OF_ACCOUNTS,
  PROFIT_LOSS_SNAPSHOTS,
  PROFIT_LOSS_TREND,
} from '../data/mockData'
import type {
  AccountingTransaction,
  CashAccountBalance,
  ChartOfAccountEntry,
  ProfitLossSnapshot,
  ProfitLossTrendPoint,
} from '../types'

export function getCashBalancesForBusiness(businessId?: string) {
  return businessId
    ? CASH_ACCOUNT_BALANCES.filter((item) => item.businessId === businessId)
    : CASH_ACCOUNT_BALANCES
}

export function getChartAccountsForBusiness(businessId?: string) {
  return businessId
    ? CHART_OF_ACCOUNTS.filter((item) => item.businessId === businessId)
    : CHART_OF_ACCOUNTS
}

export function getProfitLossAccountsForBusiness(businessId?: string) {
  const accounts = getChartAccountsForBusiness(businessId)

  return {
    income: accounts.filter((account) => account.profitLossGroup === 'income'),
    costOfGoodsSold: accounts.filter(
      (account) => account.profitLossGroup === 'cost_of_goods_sold',
    ),
    operatingExpenses: accounts.filter(
      (account) => account.profitLossGroup === 'operating_expense',
    ),
  }
}

export function getProfitLossSnapshotForBusiness(businessId?: string) {
  return businessId
    ? PROFIT_LOSS_SNAPSHOTS.find((item) => item.businessId === businessId) ?? null
    : PROFIT_LOSS_SNAPSHOTS[0] ?? null
}

export function getProfitLossTrendForBusiness(businessId?: string) {
  return businessId
    ? PROFIT_LOSS_TREND.filter((item) => item.businessId === businessId)
    : PROFIT_LOSS_TREND
}

export function getAccountingTransactionsForBusiness(businessId?: string) {
  return businessId
    ? ACCOUNTING_TRANSACTIONS.filter((item) => item.businessId === businessId)
    : ACCOUNTING_TRANSACTIONS
}

export function calculateProfitLoss(snapshot: ProfitLossSnapshot) {
  const grossProfit = snapshot.totalIncome - snapshot.costOfSales
  const netProfit = grossProfit - snapshot.operatingExpenses

  return {
    income: snapshot.totalIncome,
    costOfGoodsSold: snapshot.costOfSales,
    grossProfit,
    operatingExpenses: snapshot.operatingExpenses,
    netProfit,
  }
}

export function getOverallCashBalance(accounts: CashAccountBalance[]) {
  return accounts.reduce((sum, account) => sum + account.balance, 0)
}

export function resolveAccountingAccountName(
  accountId: string | undefined,
  cashAccounts: CashAccountBalance[],
  chartAccounts: ChartOfAccountEntry[],
) {
  if (!accountId) {
    return 'Not selected'
  }

  return (
    cashAccounts.find((item) => item.id === accountId)?.name ??
    chartAccounts.find((item) => item.id === accountId)?.name ??
    accountId
  )
}

export function buildProjectedBalances(
  cashAccounts: CashAccountBalance[],
  chartAccounts: ChartOfAccountEntry[],
  transactions: AccountingTransaction[],
) {
  const cashMap = new Map(cashAccounts.map((account) => [account.id, account.balance]))
  const chartMap = new Map(chartAccounts.map((account) => [account.id, account.balance]))

  transactions.forEach((transaction) => {
    if (transaction.type === 'receive') {
      if (transaction.toAccountId) {
        if (cashMap.has(transaction.toAccountId)) {
          cashMap.set(
            transaction.toAccountId,
            (cashMap.get(transaction.toAccountId) ?? 0) + transaction.amount,
          )
        } else if (chartMap.has(transaction.toAccountId)) {
          chartMap.set(
            transaction.toAccountId,
            (chartMap.get(transaction.toAccountId) ?? 0) + transaction.amount,
          )
        }
      }
      return
    }

    if (transaction.type === 'send') {
      if (transaction.fromAccountId) {
        if (cashMap.has(transaction.fromAccountId)) {
          cashMap.set(
            transaction.fromAccountId,
            (cashMap.get(transaction.fromAccountId) ?? 0) - transaction.amount,
          )
        } else if (chartMap.has(transaction.fromAccountId)) {
          chartMap.set(
            transaction.fromAccountId,
            (chartMap.get(transaction.fromAccountId) ?? 0) - transaction.amount,
          )
        }
      }

      if (transaction.toAccountId) {
        if (cashMap.has(transaction.toAccountId)) {
          cashMap.set(
            transaction.toAccountId,
            (cashMap.get(transaction.toAccountId) ?? 0) + transaction.amount,
          )
        } else if (chartMap.has(transaction.toAccountId)) {
          chartMap.set(
            transaction.toAccountId,
            (chartMap.get(transaction.toAccountId) ?? 0) + transaction.amount,
          )
        }
      }
      return
    }

    if (transaction.fromAccountId) {
      if (cashMap.has(transaction.fromAccountId)) {
        cashMap.set(
          transaction.fromAccountId,
          (cashMap.get(transaction.fromAccountId) ?? 0) - transaction.amount,
        )
      } else if (chartMap.has(transaction.fromAccountId)) {
        chartMap.set(
          transaction.fromAccountId,
          (chartMap.get(transaction.fromAccountId) ?? 0) - transaction.amount,
        )
      }
    }

    if (transaction.toAccountId) {
      if (cashMap.has(transaction.toAccountId)) {
        cashMap.set(
          transaction.toAccountId,
          (cashMap.get(transaction.toAccountId) ?? 0) + transaction.amount,
        )
      } else if (chartMap.has(transaction.toAccountId)) {
        chartMap.set(
          transaction.toAccountId,
          (chartMap.get(transaction.toAccountId) ?? 0) + transaction.amount,
        )
      }
    }
  })

  return {
    cashAccounts: cashAccounts.map((account) => ({
      ...account,
      balance: cashMap.get(account.id) ?? account.balance,
    })),
    chartAccounts: chartAccounts.map((account) => ({
      ...account,
      balance: chartMap.get(account.id) ?? account.balance,
    })),
  }
}

export function summarizeTrend(trend: ProfitLossTrendPoint[]) {
  return trend.map((point) => ({
    ...point,
    grossProfit: point.income - point.expenses,
  }))
}
