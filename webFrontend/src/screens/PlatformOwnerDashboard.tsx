import { Building, CreditCard, Settings, Users } from 'lucide-react'

import { PermissionGuard } from '../components/auth/PermissionGuard'
import { PageCard } from '../components/ui/PageCard'
import { useAuth } from '../features/auth/AuthContext'

export function PlatformOwnerDashboard() {
  const { user } = useAuth()

  if (!user?.isPlatformOwner) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Platform Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user.name}. Manage your entire DPay platform from here.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PageCard className="p-6">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-medium text-slate-600">Total Businesses</h2>
            <Building className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">--</div>
          <p className="text-xs text-muted-foreground">Active businesses on platform</p>
        </PageCard>

        <PageCard className="p-6">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-medium text-slate-600">Total Users</h2>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">--</div>
          <p className="text-xs text-muted-foreground">
            Registered users across all businesses
          </p>
        </PageCard>

        <PageCard className="p-6">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-medium text-slate-600">Revenue</h2>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">D--</div>
          <p className="text-xs text-muted-foreground">Total platform revenue this month</p>
        </PageCard>

        <PageCard className="p-6">
          <div className="flex items-center justify-between pb-2">
            <h2 className="text-sm font-medium text-slate-600">Active Plans</h2>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-2xl font-bold">--</div>
          <p className="text-xs text-muted-foreground">
            Businesses with active subscriptions
          </p>
        </PageCard>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PageCard className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Quick Actions</h2>
            <p className="text-sm text-muted-foreground">Common platform management tasks</p>
          </div>
          <div className="space-y-2">
            <PermissionGuard permission="platform.businesses.manage">
              <button
                type="button"
                className="flex w-full items-center justify-start rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Building className="mr-2 h-4 w-4" />
                Manage Businesses
              </button>
            </PermissionGuard>

            <PermissionGuard permission="platform.users.manage">
              <button
                type="button"
                className="flex w-full items-center justify-start rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </button>
            </PermissionGuard>

            <PermissionGuard permission="platform.billing.manage">
              <button
                type="button"
                className="flex w-full items-center justify-start rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Billing & Subscriptions
              </button>
            </PermissionGuard>
          </div>
        </PageCard>

        <PageCard className="space-y-4 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Recent Activity</h2>
            <p className="text-sm text-muted-foreground">Latest platform events</p>
          </div>
          <div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm">New business registered</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm">Subscription renewed</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                <span className="text-sm">Payment overdue</span>
              </div>
            </div>
          </div>
        </PageCard>
      </div>
    </div>
  )
}
