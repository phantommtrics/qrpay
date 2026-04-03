import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

import {
  INITIAL_PLAN_PERMISSIONS,
  PERMISSION_DEFINITIONS,
  SUBSCRIPTION_PLANS,
} from '../../data/mockData'
import { APP_PATHS, getDefaultProtectedPath } from '../../config/navigation'
import { PLATFORM_ADMIN_ROUTE_ACCESS } from '../../config/platformAdminRouteAccess'
import {
  ApiError,
  changePassword as changePasswordRequest,
  clearToken,
  createBusinessUser,
  fetchBusinessProducts,
  fetchBusinessEntitlements,
  fetchBusinessUsers,
  fetchBusinessSubscription,
  fetchPlans,
  forgotPassword as forgotPasswordRequest,
  hasStoredToken,
  login,
  mapAccessibleBusinessToOrganization,
  mapBackendUserToLoginAccount,
  mapBackendPlanToSubscriptionPlan,
  mapBackendUserToUser,
  registerBusinessOwner,
} from '../../services/subscriptionApi'
import type {
  LoginAccount,
  Organization,
  PermissionDefinition,
  PermissionKey,
  PlanId,
  PlanPermissions,
  Product,
  SubscriptionBillingInterval,
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
  billingInterval: SubscriptionBillingInterval
}

type CreateStaffPayload = {
  name: string
  email: string
  role: Extract<UserRole, 'merchant' | 'cashier'>
}

type AuthActionResult = {
  ok: boolean
  error?: string
  message?: string
  mustChangePassword?: boolean
  redirectPath?: string
}

type AuthContextValue = {
  user: User | null
  activeOrganizationId: string | null
  currentOrganization: Organization | null
  currentPlan: SubscriptionPlan | null
  subscriptionStatus: SubscriptionStatus | null
  subscriptionDaysLeft: number | null
  organizations: Organization[]
  organizationMembers: LoginAccount[]
  plans: SubscriptionPlan[]
  permissionDefinitions: PermissionDefinition[]
  planPermissions: PlanPermissions
  loginWithCredentials: (email: string, password: string) => Promise<AuthActionResult>
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthActionResult>
  forgotPassword: (email: string) => Promise<AuthActionResult>
  registerOrganization: (
    payload: RegisterOrganizationPayload,
  ) => Promise<AuthActionResult>
  createStaffAccount: (payload: CreateStaffPayload) => Promise<AuthActionResult>
  logout: () => void
  setActiveOrganization: (organizationId: string) => void
  canAccess: (permission: PermissionKey) => boolean
  updatePlanPermission: (
    planId: PlanId,
    permission: PermissionKey,
    enabled: boolean,
  ) => void
  hasAnyPermission: (permissions: PermissionKey[]) => boolean
  isRoleAllowed: (roles: UserRole[]) => boolean
  businessProducts: Product[]
  businessProductsLoading: boolean
  businessProductsError: string | null
  refreshBusinessProducts: () => Promise<void>
  refreshBusinessEntitlements: (businessId: string) => Promise<void>
  /** Re-fetch subscription + merge into active organization/plan (e.g. after invoice paid). */
  refreshBusinessSubscriptionSnapshot: (businessId: string) => Promise<void>
  refreshOrganizationMembers: () => Promise<void>
  /** Reload public plan catalog from the API (e.g. after platform billing updates). */
  refreshPlans: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const STORAGE_KEYS = {
  user: 'qrpay.auth.user.v4',
  accounts: 'qrpay.auth.accounts.v3',
  organizations: 'qrpay.auth.organizations.v3',
  activeOrganizationId: 'qrpay.auth.active-organization.v3',
  plans: 'qrpay.auth.plans',
  planPermissions: 'qrpay.auth.plan-permissions.v2',
} as const

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

function getDaysLeft(expiresAt?: string | null) {
  if (!expiresAt) {
    return null
  }

  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function mergeOrganizations(
  currentOrganizations: Organization[],
  incomingOrganizations: Organization[],
  staffCountOverrides: Record<string, number> = {},
) {
  return incomingOrganizations.map((organization) => {
    const current = currentOrganizations.find((item) => item.id === organization.id)

    return {
      ...organization,
      staffCount:
        staffCountOverrides[organization.id] ??
        current?.staffCount ??
        organization.staffCount,
    }
  })
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
  const [storedActiveOrganizationId, setStoredActiveOrganizationId] = useState<string | null>(() =>
    readStorage<string | null>(STORAGE_KEYS.activeOrganizationId, null),
  )
  const [accounts, setAccounts] = useState<LoginAccount[]>(() =>
    readStorage<LoginAccount[]>(STORAGE_KEYS.accounts, []),
  )
  const [organizations, setOrganizations] = useState<Organization[]>(() =>
    readStorage<Organization[]>(STORAGE_KEYS.organizations, []),
  )
  const [plans, setPlans] = useState<SubscriptionPlan[]>(() =>
    readStorage(STORAGE_KEYS.plans, SUBSCRIPTION_PLANS),
  )
  const [planPermissions, setPlanPermissions] =
    useState<PlanPermissions>(() =>
      readStorage<PlanPermissions>(STORAGE_KEYS.planPermissions, INITIAL_PLAN_PERMISSIONS),
    )
  const [entitlementsByBusinessId, setEntitlementsByBusinessId] = useState<
    Record<string, string[]>
  >({})
  const [businessProducts, setBusinessProducts] = useState<Product[]>([])
  const [businessProductsLoading, setBusinessProductsLoading] = useState(false)
  const [businessProductsError, setBusinessProductsError] = useState<string | null>(null)

  const clearSessionState = () => {
    clearToken()
    setUser(null)
    setStoredActiveOrganizationId(null)
    setAccounts([])
    setOrganizations([])
    setEntitlementsByBusinessId({})
    setBusinessProducts([])
    setBusinessProductsError(null)
    setBusinessProductsLoading(false)
  }

  useEffect(() => {
    writeStorage(STORAGE_KEYS.user, user)
  }, [user])

  useEffect(() => {
    if (user && !hasStoredToken()) {
      clearSessionState()
    }
    // Run once on mount to prevent stale local sessions without JWT.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  const refreshPlans = useCallback(async () => {
    try {
      const backendPlans = await fetchPlans()
      setPlans(backendPlans)
    } catch {
      // Keep current plans when the backend is unavailable.
    }
  }, [])

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

  const activeOrganizationId = useMemo(
    () => {
      if (!organizations.length) {
        return null
      }

      if (
        storedActiveOrganizationId &&
        organizations.some((organization) => organization.id === storedActiveOrganizationId)
      ) {
        return storedActiveOrganizationId
      }

      return organizations[0].id
    },
    [organizations, storedActiveOrganizationId],
  )

  const currentOrganization = useMemo(
    () =>
      activeOrganizationId
        ? organizations.find((organization) => organization.id === activeOrganizationId) ?? null
        : organizations[0] ?? null,
    [activeOrganizationId, organizations],
  )

  useEffect(() => {
    writeStorage(STORAGE_KEYS.activeOrganizationId, activeOrganizationId)
  }, [activeOrganizationId])

  const currentPlan = useMemo(
    () =>
      currentOrganization
        ? plans.find((plan) => plan.id === currentOrganization.planId) ?? null
        : null,
    [currentOrganization, plans],
  )

  const organizationMembers = useMemo(
    () => {
      if (!currentOrganization || user?.isPlatformOwner || user?.isPlatformAdmin) {
        return []
      }

      return accounts.filter((account) => account.organizationId === currentOrganization.id)
    },
    [accounts, currentOrganization, user?.isPlatformOwner, user?.isPlatformAdmin],
  )

  const subscriptionMeta = useMemo<{
    status: SubscriptionStatus | null
    daysLeft: number | null
  }>(
    () => {
      if (user?.isPlatformOwner || user?.isPlatformAdmin) {
        return { status: 'active', daysLeft: null }
      }

      if (!currentOrganization) {
        return getSubscriptionMeta()
      }

      if (currentOrganization.subscriptionState === 'trialing') {
        return {
          status: 'trialing',
          daysLeft: getDaysLeft(currentOrganization.subscriptionInvoiceDueAt),
        }
      }

      if (currentOrganization.subscriptionState === 'past_due') {
        return {
          status: 'past_due',
          daysLeft: getDaysLeft(currentOrganization.subscriptionInvoiceDueAt),
        }
      }

      return getSubscriptionMeta(currentOrganization.subscriptionExpiresAt)
    },
    [currentOrganization, user?.isPlatformOwner, user?.isPlatformAdmin],
  )

  const businessIdForApi = currentOrganization?.id

  const refreshBusinessProducts = useCallback(async () => {
    if (!businessIdForApi) {
      setBusinessProducts([])
      setBusinessProductsError(null)
      setBusinessProductsLoading(false)
      return
    }

    setBusinessProductsLoading(true)
    setBusinessProductsError(null)
    try {
      const list = await fetchBusinessProducts(businessIdForApi)
      setBusinessProducts(list)
    } catch (error) {
      setBusinessProducts([])
      setBusinessProductsError(
        error instanceof ApiError ? error.message : 'Could not load products.',
      )
    } finally {
      setBusinessProductsLoading(false)
    }
  }, [businessIdForApi])

  const refreshBusinessEntitlements = useCallback(async (businessId: string) => {
    try {
      const slugs = await fetchBusinessEntitlements(businessId)
      setEntitlementsByBusinessId((prev) => ({
        ...prev,
        [businessId]: slugs,
      }))
    } catch {
      // Keep cached entitlements on failure.
    }
  }, [])

  const refreshBusinessSubscriptionSnapshot = useCallback(
    async (businessId: string) => {
      await refreshBusinessEntitlements(businessId)
      if (!businessId || user?.isPlatformOwner || user?.isPlatformAdmin) {
        return
      }
      try {
        const payload = await fetchBusinessSubscription(businessId)
        if (payload.currentSubscription?.plan) {
          const mappedPlan = mapBackendPlanToSubscriptionPlan(payload.currentSubscription.plan)
          setPlans((current) => {
            const next = current.filter((plan) => plan.id !== mappedPlan.id)
            return [...next, mappedPlan]
          })
        }
        setOrganizations((current) =>
          current.some((o) => o.id === businessId)
            ? current.map((organization) =>
                organization.id === businessId
                  ? {
                      ...organization,
                      ...mapAccessibleBusinessToOrganization({
                        business: payload.business,
                        currentSubscription: payload.currentSubscription,
                        isOwner: organization.isOwner ?? false,
                      }),
                      staffCount: organization.staffCount,
                    }
                  : organization,
              )
            : current,
        )
      } catch {
        // Keep cached organization; entitlements already refreshed above.
      }
    },
    [refreshBusinessEntitlements, user?.isPlatformAdmin, user?.isPlatformOwner],
  )

  const refreshOrganizationMembers = useCallback(async () => {
    if (!businessIdForApi || user?.isPlatformOwner || user?.isPlatformAdmin) {
      return
    }

    try {
      const members = await fetchBusinessUsers(businessIdForApi)
      setAccounts(members)
      setOrganizations((current) =>
        current.map((organization) =>
          organization.id === businessIdForApi
            ? {
                ...organization,
                staffCount: members.filter((m) => m.membershipStatus !== 'TERMINATED').length,
              }
            : organization,
        ),
      )
    } catch {
      // Keep prior members on failure.
    }
  }, [businessIdForApi, user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    void refreshBusinessProducts()
  }, [refreshBusinessProducts])

  useEffect(() => {
    if (!businessIdForApi || user?.isPlatformOwner || user?.isPlatformAdmin) {
      return
    }

    let cancelled = false

    fetchBusinessSubscription(businessIdForApi)
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
            organization.id === businessIdForApi
              ? {
                  ...organization,
                  ...mapAccessibleBusinessToOrganization({
                    business: payload.business,
                    currentSubscription: payload.currentSubscription,
                    isOwner: organization.isOwner ?? false,
                  }),
                  staffCount: organization.staffCount,
                  planId: mappedPlan.id,
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
  }, [businessIdForApi, user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    if (!businessIdForApi || user?.isPlatformOwner || user?.isPlatformAdmin) {
      return
    }

    let cancelled = false

    fetchBusinessUsers(businessIdForApi)
      .then((members) => {
        if (!cancelled) {
          setAccounts(members)
          setOrganizations((current) =>
            current.map((organization) =>
              organization.id === businessIdForApi
                ? {
                    ...organization,
                    staffCount: members.filter((m) => m.membershipStatus !== 'TERMINATED').length,
                  }
                : organization,
            ),
          )
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccounts([])
        }
      })

    return () => {
      cancelled = true
    }
  }, [businessIdForApi, user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    if (!businessIdForApi || user?.isPlatformOwner || user?.isPlatformAdmin) {
      return
    }

    let cancelled = false

    fetchBusinessEntitlements(businessIdForApi)
      .then((slugs) => {
        if (!cancelled) {
          setEntitlementsByBusinessId((prev) => ({
            ...prev,
            [businessIdForApi]: slugs,
          }))
        }
      })
      .catch(() => {
        // Offline or unauthorized; keep prior entitlements or fall back to plan matrix.
      })

    return () => {
      cancelled = true
    }
  }, [businessIdForApi, user?.isPlatformOwner, user?.isPlatformAdmin])

  useEffect(() => {
    if (!businessIdForApi || user?.isPlatformOwner || user?.isPlatformAdmin) {
      return
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshBusinessEntitlements(businessIdForApi)
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [businessIdForApi, user?.isPlatformOwner, user?.isPlatformAdmin, refreshBusinessEntitlements])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      activeOrganizationId,
      currentOrganization,
      currentPlan,
      subscriptionStatus: subscriptionMeta.status,
      subscriptionDaysLeft: subscriptionMeta.daysLeft,
      organizations,
      organizationMembers,
      plans,
      permissionDefinitions: PERMISSION_DEFINITIONS,
      planPermissions,
      loginWithCredentials: async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase()

        try {
          const payload = await login({
            email: normalizedEmail,
            password,
          })

          const nextUser = mapBackendUserToUser(payload.user)
          setUser(nextUser)
          const nextOrganizations = payload.accessibleBusinesses.map(
            mapAccessibleBusinessToOrganization,
          )

          setOrganizations((current) => mergeOrganizations(current, nextOrganizations))
          setEntitlementsByBusinessId((prev) => ({
            ...prev,
            ...Object.fromEntries(
              payload.accessibleBusinesses.map((e) => [
                e.business.id,
                e.entitlements ?? prev[e.business.id] ?? [],
              ]),
            ),
          }))
          setStoredActiveOrganizationId(
            payload.activeBusinessId ?? nextOrganizations[0]?.id ?? null,
          )
          setAccounts([])

          return {
            ok: true,
            mustChangePassword: nextUser.mustChangePassword,
            redirectPath: nextUser.mustChangePassword
              ? APP_PATHS.changePassword
              : getDefaultProtectedPath(nextUser.role),
          }
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              error: error.message,
            }
          }

          return {
            ok: false,
            error: 'Unable to reach the server.',
          }
        }
      },
      changePassword: async (currentPassword, newPassword) => {
        if (!user) {
          return {
            ok: false,
            error: 'You must be signed in to change your password.',
          }
        }

        try {
          const payload = await changePasswordRequest({
            email: user.email,
            currentPassword,
            newPassword,
          })

          setUser((prev) => {
            const next = mapBackendUserToUser(payload.user)
            if (next.isPlatformAdmin && prev?.platformPermissions && !next.platformPermissions) {
              return { ...next, platformPermissions: prev.platformPermissions }
            }
            return next
          })

          return {
            ok: true,
            message: 'Password updated successfully.',
          }
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              error: error.message,
            }
          }

          return {
            ok: false,
            error: 'Unable to reach the server.',
          }
        }
      },
      forgotPassword: async (email) => {
        try {
          const payload = await forgotPasswordRequest({
            email: email.trim().toLowerCase(),
          })

          return {
            ok: true,
            message: payload.message,
          }
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              error: error.message,
            }
          }

          return {
            ok: false,
            error: 'Unable to reach the server.',
          }
        }
      },
      registerOrganization: async ({
        ownerName,
        ownerEmail,
        organizationName,
        industry,
        planId,
        staffCount,
        billingInterval,
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

        try {
          const wasAlreadySignedIn = hasStoredToken()
          const payload = await registerBusinessOwner({
            ownerName: ownerName.trim(),
            ownerEmail: normalizedEmail,
            businessName: organizationName.trim(),
            slug: slugify(organizationName),
            industry: industry.trim(),
            planId,
            billingInterval,
          })

          if (!wasAlreadySignedIn) {
            return {
              ok: true,
              message:
                'Account created and your trial has started. Check your email for a temporary password, then sign in.',
              redirectPath: APP_PATHS.login,
            }
          }

          const nextOrganizations = payload.accessibleBusinesses.map(
            mapAccessibleBusinessToOrganization,
          )

          setOrganizations((current) =>
            mergeOrganizations(current, nextOrganizations, {
              [payload.business.id]: staffCount,
            }),
          )
          setStoredActiveOrganizationId(payload.activeBusinessId ?? payload.business.id)
          setAccounts([
            mapBackendUserToLoginAccount(payload.user, payload.business.id, true),
          ])
          setUser(mapBackendUserToUser(payload.user))
          setEntitlementsByBusinessId((prev) => ({
            ...prev,
            ...Object.fromEntries(
              payload.accessibleBusinesses.map((e) => [
                e.business.id,
                e.entitlements ?? prev[e.business.id] ?? [],
              ]),
            ),
          }))

          return {
            ok: true,
            message: 'Business created and trial started.',
          }
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              error: error.message,
            }
          }

          return {
            ok: false,
            error: 'Unable to reach the server.',
          }
        }
      },
      createStaffAccount: async ({ name, email, role }) => {
        if (!currentOrganization || !currentPlan) {
          return {
            ok: false,
            error: 'A business organization must be selected before adding staff.',
          }
        }

        const normalizedEmail = email.trim().toLowerCase()
        const maxSeats = currentPlan.maxStaff
        const activeMembers = organizationMembers.filter(
          (m) => m.membershipStatus !== 'TERMINATED',
        ).length

        if (maxSeats !== null && activeMembers >= maxSeats) {
          return {
            ok: false,
            error: `${currentPlan.name} allows up to ${maxSeats} staff logins.`,
          }
        }

        try {
          const result = await createBusinessUser({
            businessId: currentOrganization.id,
            name: name.trim(),
            email: normalizedEmail,
            role,
          })

          setAccounts((current) => mergeById(current, [result.account]))

          return {
            ok: true,
            message:
              result.inviteType === 'new-user'
                ? 'Staff account created and a temporary password was emailed.'
                : 'Existing user added to the business and notified by email.',
          }
        } catch (error) {
          if (error instanceof ApiError) {
            return {
              ok: false,
              error:
                error.statusCode === 401
                  ? `${error.message} Sign out and sign in again if this keeps happening.`
                  : error.message,
            }
          }

          return {
            ok: false,
            error: 'Unable to reach the server.',
          }
        }
      },
      logout: () => {
        clearSessionState()
      },
      setActiveOrganization: (organizationId) => {
        setStoredActiveOrganizationId(organizationId)
      },
      canAccess: (permission) => {
        if (!user) {
          return false
        }

        if (user.isPlatformOwner) {
          return true
        }

        if (user.isPlatformAdmin) {
          if (permission === 'platform.payment_gateways.manage') {
            const m = user.platformPermissions?.['platform.payment_gateways']
            return Boolean(m?.view || m?.create || m?.edit || m?.delete)
          }
          const gate = PLATFORM_ADMIN_ROUTE_ACCESS[permission]
          if (!gate) {
            return false
          }
          return Boolean(user.platformPermissions?.[gate.module]?.[gate.action])
        }

        if (!currentOrganization) {
          return false
        }

        const billingSlugs: PermissionKey[] = ['subscriptions.billings', 'subscriptions.invoices']
        if (
          billingSlugs.includes(permission) &&
          (user.role === 'merchant' || user.role === 'admin')
        ) {
          const fromBilling = entitlementsByBusinessId[currentOrganization.id]
          if (fromBilling !== undefined) {
            return fromBilling.includes(permission)
          }
          return Boolean(planPermissions[currentOrganization.planId]?.[permission])
        }

        if (
          currentOrganization.subscriptionState === 'expired' ||
          getSubscriptionMeta(currentOrganization.subscriptionExpiresAt).status === 'expired'
        ) {
          return false
        }

        const fromServer = entitlementsByBusinessId[currentOrganization.id]
        if (fromServer !== undefined) {
          return fromServer.includes(permission)
        }

        return Boolean(planPermissions[currentOrganization.planId]?.[permission])
      },
      hasAnyPermission: (permissions) => {
        if (!user) {
          return false
        }

        if (user.isPlatformOwner) {
          return true
        }

        if (user.isPlatformAdmin) {
          return permissions.some((permission) => {
            if (permission === 'platform.payment_gateways.manage') {
              const m = user.platformPermissions?.['platform.payment_gateways']
              return Boolean(m?.view || m?.create || m?.edit || m?.delete)
            }
            const gate = PLATFORM_ADMIN_ROUTE_ACCESS[permission]
            if (!gate) {
              return false
            }
            return Boolean(user.platformPermissions?.[gate.module]?.[gate.action])
          })
        }

        if (!currentOrganization) {
          return false
        }

        if (
          currentOrganization.subscriptionState === 'expired' ||
          getSubscriptionMeta(currentOrganization.subscriptionExpiresAt).status === 'expired'
        ) {
          return false
        }

        const fromServer = entitlementsByBusinessId[currentOrganization.id]
        if (fromServer !== undefined) {
          return permissions.some((p) => fromServer.includes(p))
        }

        return permissions.some((permission) => Boolean(planPermissions[currentOrganization.planId]?.[permission]))
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
          return roles.includes('platform_owner')
        }

        if (user.isPlatformAdmin) {
          return roles.includes('platform_admin')
        }

        return roles.includes(user.role)
      },
      businessProducts,
      businessProductsLoading,
      businessProductsError,
      refreshBusinessProducts,
      refreshBusinessEntitlements,
      refreshBusinessSubscriptionSnapshot,
      refreshOrganizationMembers,
      refreshPlans,
    }),
    [
      activeOrganizationId,
      businessProducts,
      businessProductsError,
      businessProductsLoading,
      entitlementsByBusinessId,
      currentOrganization,
      currentPlan,
      organizationMembers,
      organizations,
      plans,
      planPermissions,
      refreshBusinessProducts,
      refreshBusinessEntitlements,
      refreshBusinessSubscriptionSnapshot,
      refreshOrganizationMembers,
      refreshPlans,
      subscriptionMeta,
      user,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
