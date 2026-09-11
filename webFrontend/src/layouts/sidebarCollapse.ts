export const SIDEBAR_COLLAPSED_STORAGE_KEY = 'qrpay.sidebar.collapsed.v1'

export function readSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
}

export function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed))
}
