const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const API_BASE_URL = rawApiBaseUrl?.length
  ? rawApiBaseUrl.replace(/\/$/, '')
  : 'http://localhost:4000/api'
