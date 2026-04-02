import { useCallback, useMemo, useState } from 'react'

import type { CartItem, Product } from '../../types'

function sellableUnits(product: Product): number {
  return product.availableStock ?? product.stock
}

export type AddToCartResult =
  | { ok: true }
  | { ok: false; reason: 'out_of_stock' | 'max_in_cart' }

export function useCart(options?: {
  minQuantity?: number
  removeWhenZero?: boolean
}) {
  const [cart, setCart] = useState<CartItem[]>([])
  const minQuantity = options?.minQuantity ?? 1
  const removeWhenZero = options?.removeWhenZero ?? false

  const total = useMemo(
    () =>
      cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart],
  )
  const itemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  )

  const addToCart = (product: Product): AddToCartResult => {
    let result: AddToCartResult = { ok: false, reason: 'out_of_stock' }
    setCart((current) => {
      const cap = sellableUnits(product)
      if (cap <= 0) {
        result = { ok: false, reason: 'out_of_stock' }
        return current
      }

      const existing = current.find((item) => item.product.id === product.id)
      const currentQty = existing?.quantity ?? 0
      if (currentQty >= cap) {
        result = { ok: false, reason: 'max_in_cart' }
        return current
      }

      result = { ok: true }
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [...current, { product, quantity: 1 }]
    })
    return result
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) => {
      const updated = current.map((item) => {
        if (item.product.id !== productId) {
          return item
        }

        const maxQ = sellableUnits(item.product)
        const raw = item.quantity + delta
        const next =
          delta > 0
            ? Math.max(minQuantity, Math.min(raw, maxQ))
            : Math.max(minQuantity, raw)

        return {
          ...item,
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
