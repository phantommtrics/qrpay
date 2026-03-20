import {
  createContext,
  useContext,
  useEffect,
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
import {
  ApiError,
  createBusiness,
  createSubscription,
  fetchBusinessSubscription,
  fetchPlans,
  mapBackendPlanToSubscriptionPlan,
} from '../../services/subscriptionApi'
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
  ) => Promise<AuthActionResult>
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

const STORAGE_KEYS = {
  user: 'qrpay.auth.user',
  accounts: 'qrpay.auth.accounts',
  organizations: 'qrpay.auth.organizations',
  plans: 'qrpay.auth.plans',
  planPermissions: 'qrpay.auth.plan-permissions',
} as const

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

function readStorage<T>(key: string, fallback: T) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const value = window.localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(key, JSON.stringify(value))
}

function mergeById<T extends { id: string }>(base: T[], extra: T[]) {
  const items = new Map<string, T>()

  for (const item of base) {
    items.set(item.id, item)
  }

  for (const item of extra) {
    items.set(item.id, item)
  }

  return Array.from(items.values())
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
  const [user, setUser] = useState<User | null>(() => readStorage(STORAGE_KEYS.user, null))
  const [accounts, setAccounts] = useState<LoginAccount[]>(() =>
    mergeById(MOCK_LOGIN_ACCOUNTS, readStorage<LoginAccount[]>(STORAGE_KEYS.accounts, [])),
  )
  const [organizations, setOrganizations] = useState<Organization[]>(() =>
    mergeById(MOCK_ORGANIZATIONS, readStorage<Organization[]>(STORAGE_KEYS.organizations, [])),
  )
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() =>
    readStorage(STORAGE_KEYS.plans, SUBSCRIPTION_PLANS),
  )
  const [planPermissions, setPlanPermissions] =
    useState<PlanPermissions>(() =>
      readStorage<PlanPermissions>(STORAGE_KEYS.planPermissions, INITIAL_PLAN_PERMISSIONS),
    )

  useEffect(() => {
    writeStorage(STORAGE_KEYS.user, user)
  }, [user])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.accounts, accounts)
  }, [accounts])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.organizations, organizations)
  }, [organizations])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.plans, plans)
  }, [plans])

  useEffect(() => {
    writeStorage(STORAGE_KEYS.planPermissions, planPermissions)
  }, [planPermissions])

  useEffect(() => {
    let cancelled = false

    fetchPlans()
      .then((backendPlans) => {
        if (!cancelled) {
          setPlans(backendPlans)
        }
      })
      .catch(() => {
        // Keep the existing mock plans when the backend is not running yet.
      })

    return () => {
      cancelled = true
    }
  }, [])

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
        ? plans.find((plan) => plan.id === currentOrganization.planId) ?? null
        : null,
    [currentOrganization, plans],
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

  useEffect(() => {
    if (!currentOrganization || user?.isPlatformOwner) {
      return
    }

    let cancelled = false

    fetchBusinessSubscription(currentOrganization.id)
      .then((payload) => {
        if (cancelled || !payload.currentSubscription) {
          return
        }

        const mappedPlan = mapBackendPlanToSubscriptionPlan(payload.currentSubscription.plan)

        setPlans((current) => {
          const next = current.filter((plan) => plan.id !== mappedPlan.id)
          return [...next, mappedPlan]
        })

        setOrganizations((current) =>
          current.map((organization) =>
            organization.id === currentOrganization.id
              ? {
                  ...organization,
                  name: payload.business.name,
                  slug: payload.business.slug,
                  ownerName: payload.business.ownerName,
                  planId: mappedPlan.id,
                  subscriptionExpiresAt: payload.currentSubscription?.currentPeriodEnd,
                }
              : organization,
          ),
        )
      })
      .catch(() => {
        // Mock organizations are not expected to exist in the backend yet.
      })

    return () => {
      cancelled = true
    }
  }, [currentOrganization?.id, user?.isPlatformOwner])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      currentOrganization,
      currentPlan,
      subscriptionStatus: subscriptionMeta.status,
      subscriptionDaysLeft: subscriptionMeta.daysLeft,
      organizations,
      organizationMembers,
      plans,
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
      registerOrganization: async ({
        ownerName,
        ownerEmail,
        organizationName,
        industry,
        planId,
        staffCount,
      }) => {
        const normalizedEmail = ownerEmail.trim().toLowerCase()
        const selectedPlan = plans.find((plan) => plan.id === planId)

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

        const generatedPassword = 'demo123'
        const registerLocally = (payload: {
          organizationId: string
          subscriptionExpiresAt: string
          createdAt?: string
          slug?: string
          organizationName?: string
          ownerName?: string
        }) => {
          const nextOrganization: Organization = {
            id: payload.organizationId,
            name: payload.organizationName ?? organizationName.trim(),
            slug: payload.slug ?? slugify(organizationName),
            industry: industry.trim(),
            planId,
            staffCount,
            ownerName: payload.ownerName ?? ownerName.trim(),
            subscriptionExpiresAt: payload.subscriptionExpiresAt,
            createdAt: payload.createdAt ?? new Date().toISOString(),
          }

          const nextAccount: LoginAccount = {
            id: `acct-${payload.organizationId}-owner`,
            email: normalizedEmail,
            password: generatedPassword,
            name: ownerName.trim(),
            role: 'merchant',
            organizationId: payload.organizationId,
          }

          setOrganizations((current) => mergeById(current, [nextOrganization]))
          setAccounts((current) => mergeById(current, [nextAccount]))
          setUser(normalizeUser(nextAccount))

          return { ok: true, generatedPassword }
        }

        try {
          const business = await createBusiness({
            name: organizationName.trim(),
            slug: slugify(organizationName),
            ownerName: ownerName.trim(),
            ownerEmail: normalizedEmail,
          })

          const { subscription } = await createSubscription(business.id, planId)

          return registerLocally({
            organizationId: business.id,
            subscriptionExpiresAt: subscription.currentPeriodEnd,
            createdAt: business.createdAt,
            slug: business.slug,
            organizationName: business.name,
            ownerName: business.ownerName,
          })
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              error: error.message,
            }
          }

          return registerLocally({
            organizationId: `local-${Date.now()}`,
            subscriptionExpiresAt: new Date(
              Date.now() + 1000 * 60 * 60 * 24 * 30,
            ).toISOString(),
          })
        }
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

        return Boolean(planPermissions[currentOrganization.planId]?.[permission])
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
      plans,
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
