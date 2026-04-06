import type { Product } from '../types'

/**
 * Units a customer can still buy (on hand minus reservations), reconciled with
 * `availableStock` from the API when the two disagree.
 *
 * Some payloads can end up with `stock`/`reservedStock` not yet applied on the client
 * while `availableStock` is correct (or vice versa). Using only `stock - reserved`
 * then wrongly shows 0 for guest menus; using only `availableStock` ignores
 * reservations. We merge both conservatively.
 */
export function productSellableUnits(product: Product): number {
  const onHand = Math.max(0, Math.floor(Number(product.stock) || 0))
  const reserved = Math.max(0, Math.floor(Number(product.reservedStock) || 0))
  const derived = Math.max(0, onHand - reserved)

  const raw = product.availableStock
  if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) {
    return derived
  }
  const parsed = Math.max(0, Math.floor(Number(raw)))

  if (derived <= 0 && parsed > 0) return parsed
  if (parsed <= 0 && derived > 0) return derived
  return Math.min(derived, parsed)
}
