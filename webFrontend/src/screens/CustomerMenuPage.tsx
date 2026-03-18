import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  CheckCircle2,
  ChevronLeft,
  Minus,
  Plus,
  QrCode,
  Utensils,
} from 'lucide-react'

import { MOCK_PRODUCTS } from '../data/mockData'
import type { CartItem, Product } from '../types'
import { formatMoney } from '../utils/formatMoney'

export function CustomerMenuPage() {
  const { tableId = 'T-01' } = useParams()
  const [activeCategory, setActiveCategory] = useState('All')
  const [cart, setCart] = useState<CartItem[]>([])
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [orderStatus, setOrderStatus] = useState<'browsing' | 'paying' | 'success'>(
    'browsing',
  )

  const menuItems = MOCK_PRODUCTS.filter((product) => product.businessId === 'b2')
  const categories = ['All', ...new Set(menuItems.map((item) => item.category))]
  const filteredItems =
    activeCategory === 'All'
      ? menuItems
      : menuItems.filter((item) => item.category === activeCategory)
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0)

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
      current
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item,
        )
        .filter((item) => item.quantity > 0),
    )
  }

  if (orderStatus === 'success') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"
        >
          <CheckCircle2 className="h-12 w-12" />
        </motion.div>
        <h1 className="mb-2 text-3xl font-bold text-slate-800">Order Placed!</h1>
        <p className="mb-8 max-w-sm text-slate-600">
          Your order has been sent to the kitchen. We will bring it to {tableId}{' '}
          shortly.
        </p>
        <div className="mb-8 w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <p className="mb-1 text-sm text-slate-500">Order Number</p>
          <p className="font-mono text-2xl font-bold text-slate-800">
            #ORD-{Math.floor(Math.random() * 10000)}
          </p>
        </div>
        <button
          onClick={() => {
            setOrderStatus('browsing')
            setCart([])
          }}
          className="font-medium text-teal-600 hover:underline"
        >
          Order more items
        </button>
      </div>
    )
  }

  if (orderStatus === 'paying') {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50">
        <header className="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-white p-4">
          <button
            onClick={() => setOrderStatus('browsing')}
            className="-ml-2 p-2 text-slate-600"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <h1 className="ml-2 text-lg font-bold text-slate-800">Checkout</h1>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <h2 className="mb-2 text-xl font-bold text-slate-800">Pay via Wallet</h2>
            <p className="mb-8 text-sm text-slate-500">Scan with your mobile money app</p>
            <div className="mb-8 inline-block rounded-2xl border-2 border-slate-100 bg-white p-4 shadow-inner">
              <QrCode className="h-48 w-48 text-slate-800" />
            </div>
            <div className="mb-6 flex items-center justify-between border-t border-slate-100 py-4">
              <span className="font-medium text-slate-600">Total to pay</span>
              <span className="text-2xl font-bold text-teal-600">{formatMoney(total)}</span>
            </div>
            <button
              onClick={() => setOrderStatus('success')}
              className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-md shadow-teal-600/20 transition-colors hover:bg-teal-700"
            >
              Simulate Payment
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 bg-white px-4 pt-8 pb-4 shadow-sm">
        <div className="mx-auto max-w-3xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Taste of Gambia</h1>
              <p className="mt-1 flex items-center font-medium text-teal-600">
                <Utensils className="mr-1 h-4 w-4" /> {tableId}
              </p>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={`rounded-full px-5 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeCategory === category
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
            >
              <div
                className={`flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl text-4xl ${item.imageColor}`}
              >
                {item.imageEmoji}
              </div>
              <div className="flex flex-1 flex-col justify-between">
                <div>
                  <h3 className="mb-1 font-bold leading-tight text-slate-800">
                    {item.name}
                  </h3>
                  <p className="line-clamp-2 text-xs text-slate-500">
                    {item.description}
                  </p>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-teal-600">D{item.price}</span>
                  <button
                    onClick={() => addToCart(item)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-600 transition-colors hover:bg-teal-100"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </main>

      <AnimatePresence>
        {itemCount > 0 && !isCartOpen ? (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed right-0 bottom-6 left-0 z-20 mx-auto max-w-3xl px-4"
          >
            <button
              onClick={() => setIsCartOpen(true)}
              className="flex w-full items-center justify-between rounded-2xl bg-slate-900 p-4 text-white shadow-xl"
            >
              <div className="flex items-center">
                <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-teal-500 font-bold">
                  {itemCount}
                </div>
                <span className="font-medium">View Order</span>
              </div>
              <span className="font-bold">{formatMoney(total)}</span>
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isCartOpen ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm"
              onClick={() => setIsCartOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 bottom-0 left-0 z-40 mx-auto flex max-h-[85vh] max-w-3xl flex-col rounded-t-3xl bg-white"
            >
              <div className="flex items-center justify-between border-b border-slate-100 p-4">
                <h2 className="text-xl font-bold text-slate-800">Your Order</h2>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="rounded-full bg-slate-100 p-2 text-slate-400"
                >
                  <ChevronLeft className="h-5 w-5 -rotate-90" />
                </button>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto p-4">
                {cart.map((item) => (
                  <div key={item.product.id} className="flex items-center gap-4">
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-xl text-2xl ${item.product.imageColor}`}
                    >
                      {item.product.imageEmoji}
                    </div>
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800">
                        {item.product.name}
                      </h4>
                      <p className="text-sm font-semibold text-teal-600">
                        D{item.product.price}
                      </p>
                    </div>
                    <div className="flex items-center rounded-full bg-slate-100 p-1">
                      <button
                        onClick={() => updateQuantity(item.product.id, -1)}
                        className="flex h-8 w-8 items-center justify-center text-slate-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center text-sm font-medium">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.product.id, 1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-t-3xl border-t border-slate-100 bg-slate-50 p-6 pb-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="font-medium text-slate-500">Total Amount</span>
                  <span className="text-2xl font-bold text-slate-800">
                    {formatMoney(total)}
                  </span>
                </div>
                <button
                  onClick={() => setOrderStatus('paying')}
                  className="w-full rounded-xl bg-teal-600 py-4 text-lg font-bold text-white shadow-lg shadow-teal-600/30 transition-transform active:scale-[0.98]"
                >
                  Place Order & Pay
                </button>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
