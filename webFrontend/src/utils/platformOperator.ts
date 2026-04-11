/** EasyPay or staff with PLATFORM_ADMIN role (JWT flags). */
export function isPlatformOperator(user: {
  isPlatformOwner?: boolean
  isPlatformAdmin?: boolean
} | null | undefined): boolean {
  return Boolean(user?.isPlatformOwner || user?.isPlatformAdmin)
}
