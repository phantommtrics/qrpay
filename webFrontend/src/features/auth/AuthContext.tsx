import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  INITIAL_PLAN_PERMISSIONS,
  MOCK_LOGIN_ACCOUNTS,
  MOCK_ORGANIZATIONS,
  PERMISSION_DEFINITIONS,
  SUBSCRIPTION_PLANS,
} from '../../data/mockData'
import type {
  LoginAccount,
  Organization,
  PermissionDefinition,
  PermissionKey,
  PlanId,
  PlanPermissions,
  SubscriptionPlan,
  SubscriptionStatus,
  User,
  UserRole,
} from '../../types'

type RegisterOrganizationPayload = {
  ownerName: string
  ownerEmail: string
  organizationName: string
  industry: string
  planId: PlanId
  staffCount: number
}

type CreateStaffPayload = {
  name: string
  email: string
  password: string
  role: Extract<UserRole, 'merchant' | 'cashier'>
}

type AuthActionResult = {
  ok: boolean
  error?: string
  generatedPassword?: string
}

type AuthContextValue = {
  user: User | null
  currentOrganization: Organization | null
  currentPlan: SubscriptionPlan | null
  subscriptionStatus: SubscriptionStatus | null
  subscriptionDaysLeft: number | null
  organizations: Organization[]
  organizationMembers: LoginAccount[]
  plans: SubscriptionPlan[]
  permissionDefinitions: PermissionDefinition[]
  planPermissions: PlanPermissions
  loginWithCredentials: (email: string, password: string) => AuthActionResult
  registerOrganization: (
    payload: RegisterOrganizationPayload,
  ) => AuthActionResult
  createStaffAccount: (payload: CreateStaffPayload) => AuthActionResult
  logout: () => void
  canAccess: (permission: PermissionKey) => boolean
  updatePlanPermission: (
    planId: PlanId,
    permission: PermissionKey,
    enabled: boolean,
  ) => void
  isRoleAllowed: (roles: UserRole[]) => boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

function normalizeUser(account: LoginAccount): User {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    businessId: account.organizationId,
    organizationId: account.organizationId,
    isPlatformOwner: account.isPlatformOwner,
  }
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function getSubscriptionMeta(expiresAt?: string) {
  if (!expiresAt) {
    return { status: null, daysLeft: null } as const
  }

  const now = Date.now()
  const expiresOn = new Date(expiresAt).getTime()
  const diffMs = expiresOn - now
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffMs < 0) {
    return { status: 'expired' as const, daysLeft }
  }

  if (daysLeft <= 7) {
    return { status: 'expiring_soon' as const, daysLeft }
  }

  return { status: 'active' as const, daysLeft }
}

function isStaffCountValid(plan: SubscriptionPlan, staffCount: number) {
  if (staffCount < plan.minStaff) {
    return false
  }

  if (plan.maxStaff !== null && staffCount > plan.maxStaff) {
    return false
  }

  return true
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [accounts, setAccounts] = useState<LoginAccount[]>(MOCK_LOGIN_ACCOUNTS)
  const [organizations, setOrganizations] = useState<Organization[]>(MOCK_ORGANIZATIONS)
  const [planPermissions, setPlanPermissions] =
    useState<PlanPermissions>(INITIAL_PLAN_PERMISSIONS)

  const currentOrganization = useMemo(
    () =>
      user?.organizationId
        ? organizations.find((organization) => organization.id === user.organizationId) ?? null
        : null,
    [organizations, user],
  )

  const currentPlan = useMemo(
    () =>
      currentOrganization
        ? SUBSCRIPTION_PLANS.find((plan) => plan.id === currentOrganization.planId) ?? null
        : null,
    [currentOrganization],
  )

  const organizationMembers = useMemo(
    () =>
      currentOrganization
        ? accounts.filter((account) => account.organizationId === currentOrganization.id)
        : [],
    [accounts, currentOrganization],
  )

  const subscriptionMeta = useMemo(
    () =>
      user?.isPlatformOwner
        ? { status: 'active' as const, daysLeft: null }
        : getSubscriptionMeta(currentOrganization?.subscriptionExpiresAt),
    [currentOrganization?.subscriptionExpiresAt, user?.isPlatformOwner],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      currentOrganization,
      currentPlan,
      subscriptionStatus: subscriptionMeta.status,
      subscriptionDaysLeft: subscriptionMeta.daysLeft,
      organizations,
      organizationMembers,
      plans: SUBSCRIPTION_PLANS,
      permissionDefinitions: PERMISSION_DEFINITIONS,
      planPermissions,
      loginWithCredentials: (email, password) => {
        const normalizedEmail = email.trim().toLowerCase()
        const account = accounts.find(
          (item) =>
            item.email.toLowerCase() === normalizedEmail && item.password === password,
        )

        if (!account) {
          return {
            ok: false,
            error: 'Invalid demo credentials. Use one of the listed mock accounts.',
          }
        }

        setUser(normalizeUser(account))

        return { ok: true }
      },
      registerOrganization: ({
        ownerName,
        ownerEmail,
        organizationName,
        industry,
        planId,
        staffCount,
      }) => {
        const normalizedEmail = ownerEmail.trim().toLowerCase()
        const selectedPlan = SUBSCRIPTION_PLANS.find((plan) => plan.id === planId)

        if (!selectedPlan) {
          return { ok: false, error: 'Please select a valid subscription plan.' }
        }

        if (!isStaffCountValid(selectedPlan, staffCount)) {
          return {
            ok: false,
            error: `The ${selectedPlan.name} plan supports ${selectedPlan.staffLabel.toLowerCase()}.`,
          }
        }

        if (accounts.some((account) => account.email.toLowerCase() === normalizedEmail)) {
          return {
            ok: false,
            error: 'This email is already used by another mock account.',
          }
        }

        const nextIndex = organizations.length + 1
        const organizationId = `b${nextIndex}`
        const nextOrganization: Organization = {
          id: organizationId,
          name: organizationName.trim(),
          slug: slugify(organizationName),
          industry: industry.trim(),
          planId,
          staffCount,
          ownerName: ownerName.trim(),
          subscriptionExpiresAt: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 30,
          ).toISOString(),
          createdAt: new Date().toISOString(),
        }

        const generatedPassword = 'demo123'
        const nextAccount: LoginAccount = {
          id: `acct-${organizationId}-owner`,
          email: normalizedEmail,
          password: generatedPassword,
          name: ownerName.trim(),
          role: 'merchant',
          organizationId,
        }

        setOrganizations((current) => [...current, nextOrganization])
        setAccounts((current) => [...current, nextAccount])
        setUser(normalizeUser(nextAccount))

        return { ok: true, generatedPassword }
      },
      createStaffAccount: ({ name, email, password, role }) => {
        if (!currentOrganization || !currentPlan) {
          return {
            ok: false,
            error: 'A business organization must be selected before adding staff.',
          }
        }

        const normalizedEmail = email.trim().toLowerCase()
        const maxSeats = currentPlan.maxStaff
        const activeMembers = accounts.filter(
          (account) => account.organizationId === currentOrganization.id,
        ).length

        if (accounts.some((account) => account.email.toLowerCase() === normalizedEmail)) {
          return {
            ok: false,
            error: 'This email is already used by another mock account.',
          }
        }

        if (maxSeats !== null && activeMembers >= maxSeats) {
          return {
            ok: false,
            error: `${currentPlan.name} allows up to ${maxSeats} staff logins.`,
          }
        }

        const nextAccount: LoginAccount = {
          id: `acct-${currentOrganization.id}-${Date.now()}`,
          email: normalizedEmail,
          password: password.trim(),
          name: name.trim(),
          role,
          organizationId: currentOrganization.id,
        }

        setAccounts((current) => [...current, nextAccount])

        return { ok: true }
      },
      logout: () => setUser(null),
      canAccess: (permission) => {
        if (!user) {
          return false
        }

        if (user.isPlatformOwner) {
          return true
        }

        if (!currentOrganization) {
          return false
        }

        if (getSubscriptionMeta(currentOrganization.subscriptionExpiresAt).status === 'expired') {
          return false
        }

        return Boolean(planPermissions[currentOrganization.planId][permission])
      },
      updatePlanPermission: (planId, permission, enabled) => {
        setPlanPermissions((current) => ({
          ...current,
          [planId]: {
            ...current[planId],
            [permission]: enabled,
          },
        }))
      },
      isRoleAllowed: (roles) => {
        if (!user) {
          return false
        }

        if (user.isPlatformOwner) {
          return true
        }

        return roles.includes(user.role)
      },
    }),
    [
      accounts,
      currentOrganization,
      currentPlan,
      organizationMembers,
      organizations,
      planPermissions,
      subscriptionMeta,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
