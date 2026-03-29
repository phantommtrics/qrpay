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
