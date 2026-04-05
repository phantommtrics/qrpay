/** Full URL for printed QR codes (app uses HashRouter — guest path lives in the hash). */
export function guestMenuUrl(slug: string, token: string): string {
  const segment = `/b/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`
  if (typeof window === 'undefined') {
    return `#${segment}`
  }
  const { origin, pathname } = window.location
  const base = pathname.endsWith('/') ? `${origin}${pathname}` : `${origin}${pathname}/`
  return `${base}#${segment}`
}
