import { useCallback, useMemo, useState } from 'react'

import type { CartItem, Product } from '../../types'

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

  const addToCart = (product: Product) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id)

      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        )
      }

      return [...current, { product, quantity: 1 }]
    })
  }

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) => {
      const updated = current.map((item) => {
        if (item.product.id !== productId) {
          return item
        }

        return {
          ...item,
          quantity: Math.max(minQuantity, item.quantity + delta),
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
