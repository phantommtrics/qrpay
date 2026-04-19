const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

function defaultDevApiBase(): string {
  if (typeof window === 'undefined') return 'http://localhost:4000/api'
  const { hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:4000/api'
  }
  return `http://${hostname}:4000/api`
}

export const API_BASE_URL = rawApiBaseUrl?.length
  ? rawApiBaseUrl.replace(/\/$/, '')
  : import.meta.env.DEV
    ? defaultDevApiBase()
    : 'http://localhost:4000/api'

const rawPlatformUrl = import.meta.env.VITE_PLATFORM_URL?.trim()

/**
 * Public origin of the web app (same as backend `PLATFORM_URL`). Used for product image URLs
 * (`/uploads/products/*` is served via this host — proxy in dev, reverse proxy in production).
 * Set `VITE_PLATFORM_URL` if the SPA is not opened at the same origin as `PLATFORM_URL`.
 */
export function getProductImagePublicOrigin(): string {
  const raw = rawPlatformUrl?.length ? rawPlatformUrl : ''
  if (raw) {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
      return new URL(withProto).origin
    } catch {
      /* fall through */
    }
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  const base = API_BASE_URL.replace(/\/$/, '')
  try {
    if (base.toLowerCase().endsWith('/api')) {
      return new URL(`${base.slice(0, -4)}/`).origin
    }
    return new URL(`${base}/`).origin
  } catch {
    return base
  }
}

/**
 * Host where the API serves non-`/api` routes such as `/uploads/*` (when not using platform URL).
 */
export function getApiPublicOrigin(): string {
  const base = API_BASE_URL.replace(/\/$/, '')
  try {
    if (base.toLowerCase().endsWith('/api')) {
      return new URL(`${base.slice(0, -4)}/`).origin
    }
    return new URL(`${base}/`).origin
  } catch {
    return base
  }
}

/**
 * Ensures product images load at `/uploads/products/...` on the **platform** origin (backend
 * `PLATFORM_URL`), even when a stored URL used a different prefix.
 */
export function normalizeProductImageUrlForDisplay(stored: string | null | undefined): string {
  if (!stored?.trim()) return ''
  const s = stored.trim()
  const tail = s.match(/\/uploads\/products\/[^/?#]+$/i)
  if (tail) {
    return `${getProductImagePublicOrigin()}${tail[0]}`
  }
  if (s.startsWith('/uploads/products/')) {
    return `${getProductImagePublicOrigin()}${s}`
  }
  return s
}
