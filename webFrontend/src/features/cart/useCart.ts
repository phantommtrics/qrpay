import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import type { CartItem, Product } from '../../types'
import { productSellableUnits } from '../../utils/productStock'

function sellableUnits(product: Product): number {
  return productSellableUnits(product)
}

function cartFingerprint(items: CartItem[]): string {
  return items
    .map(
      (i) =>
        `${i.product.id}:${i.quantity}:${i.product.availableStock ?? ''}:${i.product.stock}:${i.product.reservedStock ?? ''}`,
    )
    .sort()
    .join('|')
}

export type AddToCartResult =
  | { ok: true }
  | { ok: false; reason: 'out_of_stock' | 'max_in_cart' }

export function useCart(options?: {
  minQuantity?: number
  removeWhenZero?: boolean
  /** Resolve current catalog row so caps stay in sync (cart lines keep stale snapshots). */
  getProductById?: (productId: string) => Product | undefined
  /**
   * When this string changes (e.g. after catalog refetch), cart is merged by product id,
   * quantities clamped to current sellable caps (when cap > 0), and line snapshots refreshed.
   */
  catalogStockSignature?: string
}) {
  const [cart, setCart] = useState<CartItem[]>([])
  const minQuantity = options?.minQuantity ?? 1
  const removeWhenZero = options?.removeWhenZero ?? false
  const getProductById = options?.getProductById
  const catalogStockSignature = options?.catalogStockSignature

  const getProductByIdRef = useRef(getProductById)
  useLayoutEffect(() => {
    getProductByIdRef.current = getProductById
  }, [getProductById])

  /** Always read the latest catalog resolver (avoids stale closures inside setCart). */
  const resolveProduct = useCallback((p: Product): Product => {
    return getProductByIdRef.current?.(p.id) ?? p
  }, [])

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart],
  )
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  )

  useEffect(() => {
    if (catalogStockSignature === undefined || !getProductById) {
      return
    }
    setCart((current) => {
      if (current.length === 0) {
        return current
      }

      const merged = new Map<string, CartItem>()
      for (const item of current) {
        const id = item.product.id
        const live = getProductByIdRef.current?.(item.product.id) ?? item.product
        const prev = merged.get(id)
        if (prev) {
          merged.set(id, {
            product: live,
            quantity: prev.quantity + item.quantity,
          })
        } else {
          merged.set(id, { product: live, quantity: item.quantity })
        }
      }

      const out: CartItem[] = []
      for (const item of merged.values()) {
        const live = getProductByIdRef.current?.(item.product.id) ?? item.product
        const cap = sellableUnits(live)
        let q = item.quantity

        if (removeWhenZero && cap <= 0) {
          continue
        }

        if (cap > 0 && q > cap) {
          q = cap
        }

        if (removeWhenZero) {
          if (q <= 0) {
            continue
          }
        } else if (q < minQuantity) {
          q = minQuantity
        }

        out.push({ product: live, quantity: q })
      }

      if (cartFingerprint(out) === cartFingerprint(current) && out.length === current.length) {
        return current
      }

      return out
    })
    // getProductById is read via ref only so this effect runs when catalog numbers change,
    // not when the callback identity changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- merge keyed by catalogStockSignature; resolver via ref
  }, [catalogStockSignature, minQuantity, removeWhenZero])

  const addToCart = useCallback((product: Product): AddToCartResult => {
    /**
     * Must not use a ref for the return value: React may invoke the state updater
     * asynchronously or twice (Strict Mode). The ref could still read the initial
     * `{ ok: false }` while the cart state actually updates — wrong toast + item added.
     */
    let outcome: AddToCartResult = { ok: false, reason: 'out_of_stock' }
    flushSync(() => {
      setCart((current) => {
        const latest = resolveProduct(product)
        const cap = sellableUnits(latest)

        const merged = new Map<string, CartItem>()
        for (const item of current) {
          const id = item.product.id
          const live = resolveProduct(item.product)
          const prev = merged.get(id)
          if (prev) {
            merged.set(id, {
              product: live,
              quantity: prev.quantity + item.quantity,
            })
          } else {
            merged.set(id, { product: live, quantity: item.quantity })
          }
        }

        const list = [...merged.values()]
        const existing = list.find((item) => item.product.id === latest.id)
        const currentQty = existing?.quantity ?? 0

        if (cap <= 0) {
          outcome =
            currentQty > 0
              ? { ok: false, reason: 'max_in_cart' }
              : { ok: false, reason: 'out_of_stock' }
          return current
        }

        if (currentQty >= cap) {
          outcome = { ok: false, reason: 'max_in_cart' }
          return current
        }

        outcome = { ok: true }

        const rest = list.filter((item) => item.product.id !== latest.id)
        const nextQty = currentQty + 1
        return [...rest, { product: latest, quantity: nextQty }]
      })
    })
    return outcome
  }, [resolveProduct])

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) => {
      const merged = new Map<string, CartItem>()
      for (const item of current) {
        const id = item.product.id
        const live = resolveProduct(item.product)
        const prev = merged.get(id)
        if (prev) {
          merged.set(id, {
            product: live,
            quantity: prev.quantity + item.quantity,
          })
        } else {
          merged.set(id, { product: live, quantity: item.quantity })
        }
      }

      const list = [...merged.values()]
      const updated = list.map((item) => {
        if (item.product.id !== productId) {
          return item
        }

        const live = resolveProduct(item.product)
        const maxQ = sellableUnits(live)
        const raw = item.quantity + delta
        let next: number
        if (delta > 0) {
          next =
            maxQ > 0
              ? Math.max(minQuantity, Math.min(raw, maxQ))
              : Math.max(minQuantity, item.quantity)
        } else {
          next = Math.max(minQuantity, raw)
        }

        return {
          ...item,
          product: live,
          quantity: next,
        }
      })

      return removeWhenZero
        ? updated.filter((item) => item.quantity > 0)
        : updated
    })
  }

  const removeFromCart = (productId: string) => {
    setCart((current) => current.filter((item) => item.product.id !== productId))
  }

  const clearCart = useCallback(() => {
    setCart([])
  }, [])

  return {
    cart,
    total,
    itemCount,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  }
}
