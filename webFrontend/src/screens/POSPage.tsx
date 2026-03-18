import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Minus,
  Plus,
  QrCode,
  ScanLine,
  Search,
  ShoppingCart,
  Trash2,
} from 'lucide-react'

import { MOCK_PRODUCTS } from '../data/mockData'
import type { CartItem, Product } from '../types'

function formatMoney(value: number) {
  return `D${value.toFixed(2)}`
}

export function POSPage() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<'waiting' | 'success'>(
    'waiting',
  )

  const products = MOCK_PRODUCTS
  const subtotal = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0,
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
    setCart((current) =>
      current.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: Math.max(1, item.quantity + delta) }
          : item,
      ),
    )
  }

  const removeFromCart = (productId: string) => {
    setCart((current) => current.filter((item) => item.product.id !== productId))
  }

  const simulateScan = () => {
    setIsScanning(true)
    window.setTimeout(() => {
      setIsScanning(false)
      const randomProduct = products[Math.floor(Math.random() * products.length)]
      addToCart(randomProduct)
    }, 800)
  }

  const simulatePaymentSuccess = () => {
    setPaymentStatus('success')
    window.setTimeout(() => {
      setPaymentModalOpen(false)
      setCart([])
    }, 1800)
  }

  return (
    <div className="flex h-auto flex-col gap-6 lg:h-[calc(100vh-8rem)] lg:flex-row">
      <div className="flex flex-1 flex-col gap-6">
        <div className="relative flex min-h-[240px] flex-col items-center justify-center overflow-hidden rounded-2xl bg-slate-900 p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(20,184,166,0.25),transparent_55%)] opacity-60" />
          <div className="relative z-10 flex flex-col items-center">
            <div className="relative mb-4 flex h-48 w-48 items-center justify-center rounded-xl border-2 border-teal-500/50">
              {isScanning ? (
                <motion.div
                  animate={{ y: [-80, 80, -80] }}
                  transition={{
                    repeat: Number.POSITIVE_INFINITY,
                    duration: 1.5,
                    ease: 'linear',
                  }}
                  className="h-1 w-full bg-teal-400 shadow-[0_0_15px_rgba(45,212,191,0.8)]"
                />
              ) : (
                <ScanLine className="h-12 w-12 text-teal-500/50" />
              )}
            </div>
            <button
              onClick={simulateScan}
              disabled={isScanning}
              className="rounded-full bg-teal-600 px-6 py-2 font-medium text-white shadow-lg shadow-teal-900/50 transition-colors hover:bg-teal-500 disabled:opacity-70"
            >
              {isScanning ? 'Scanning...' : 'Simulate Scan'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search products manually..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pr-4 pl-10 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {products
                .filter((product) =>
                  product.name.toLowerCase().includes(searchTerm.toLowerCase()),
                )
                .map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="flex flex-col items-center rounded-xl border border-slate-100 p-3 text-center transition-all hover:border-teal-500 hover:bg-teal-50"
                  >
                    <div
                      className={`mb-2 flex h-12 w-12 items-center justify-center rounded-full text-2xl ${product.imageColor}`}
                    >
                      {product.imageEmoji}
                    </div>
                    <span className="line-clamp-1 w-full text-sm font-medium text-slate-700">
                      {product.name}
                    </span>
                    <span className="mt-1 text-xs font-bold text-teal-600">
                      D{product.price}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col rounded-2xl border border-slate-200 bg-white shadow-sm lg:w-96">
        <div className="flex items-center justify-between border-b border-slate-100 p-4">
          <h2 className="text-lg font-bold text-slate-800">Current Order</h2>
          <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
            {cart.reduce((sum, item) => sum + item.quantity, 0)} items
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <AnimatePresence mode="popLayout">
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex h-full flex-col items-center justify-center space-y-4 text-slate-400"
              >
                <ShoppingCart className="h-16 w-16 opacity-20" />
                <p>Scan items to add to cart</p>
              </motion.div>
            ) : (
              cart.map((item) => (
                <motion.div
                  key={item.product.id}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-3"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <h4 className="truncate text-sm font-medium text-slate-800">
                      {item.product.name}
                    </h4>
                    <p className="text-sm font-semibold text-teal-600">
                      D{item.product.price}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center rounded-lg border border-slate-200 bg-white">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="p-1.5 text-slate-500 hover:text-teal-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="p-1.5 text-slate-500 hover:text-teal-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => removeFromCart(item.product.id)}
                      className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50 p-4">
          <div className="mb-4 space-y-2 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-500">
              <span>Tax (0%)</span>
              <span>D0.00</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-800">
              <span>Total</span>
              <span>{formatMoney(subtotal)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setCart([])}
              disabled={cart.length === 0}
              className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
            >
              Clear
            </button>
            <button
              onClick={() => {
                if (cart.length === 0) return
                setPaymentStatus('waiting')
                setPaymentModalOpen(true)
              }}
              disabled={cart.length === 0}
              className="flex flex-1 items-center justify-center rounded-xl bg-teal-600 py-3 text-lg font-bold text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              Charge {formatMoney(subtotal)}
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {paymentModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => {
                if (paymentStatus === 'waiting') {
                  setPaymentModalOpen(false)
                }
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            >
              {paymentStatus === 'waiting' ? (
                <div className="flex flex-col items-center p-8 text-center">
                  <h2 className="mb-2 text-2xl font-bold text-slate-800">
                    Scan to Pay
                  </h2>
                  <p className="mb-6 text-slate-500">
                    Customer scans this QR with their wallet app
                  </p>
                  <div className="relative mb-6 rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
                    <QrCode className="h-48 w-48 text-slate-800" />
                    <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-transparent to-white/20" />
                  </div>
                  <div className="mb-6 w-full rounded-xl bg-slate-50 p-4">
                    <p className="mb-1 text-sm text-slate-500">Amount Due</p>
                    <p className="text-3xl font-bold text-teal-600">
                      {formatMoney(subtotal)}
                    </p>
                  </div>
                  <div className="flex w-full gap-3">
                    <button
                      onClick={simulatePaymentSuccess}
                      className="flex flex-1 items-center justify-center rounded-xl bg-slate-900 py-3 font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      <CreditCard className="mr-2 h-5 w-5" />
                      Simulate Wallet
                    </button>
                    <button
                      onClick={simulatePaymentSuccess}
                      className="flex flex-1 items-center justify-center rounded-xl border-2 border-slate-200 bg-white py-3 font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      <Banknote className="mr-2 h-5 w-5" />
                      Cash
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center bg-emerald-50 p-10 text-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring' }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
                  >
                    <CheckCircle2 className="h-10 w-10" />
                  </motion.div>
                  <h2 className="mb-2 text-2xl font-bold text-emerald-800">
                    Payment Successful!
                  </h2>
                  <p className="mb-8 font-medium text-emerald-600">
                    {formatMoney(subtotal)} received
                  </p>
                  <button
                    onClick={() => {
                      setPaymentModalOpen(false)
                      setCart([])
                    }}
                    className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white transition-colors hover:bg-emerald-700"
                  >
                    New Order
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
