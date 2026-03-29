import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QrCode } from 'lucide-react'

import { APP_PATHS } from '../config/navigation'
import { ApiError, fetchPublicProduct, type PublicProductPayload } from '../services/subscriptionApi'

export function ProductPublicPage() {
  const { productId } = useParams()
  const [data, setData] = useState<PublicProductPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadedForId, setLoadedForId] = useState<string | null>(null)

  const missingLinkMessage = !productId ? 'This product link is incomplete or invalid.' : null
  const loading = Boolean(productId && loadedForId !== productId)

  useEffect(() => {
    if (!productId) {
      return
    }

    let cancelled = false

    void fetchPublicProduct(productId)
      .then((payload) => {
        if (!cancelled) {
          setData(payload)
          setError(null)
          setLoadedForId(productId)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null)
          setError(err instanceof ApiError ? err.message : 'Could not load product.')
          setLoadedForId(productId)
        }
      })

    return () => {
      cancelled = true
    }
  }, [productId])

  const showPayload = data && loadedForId === productId && !error

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-700">
            <QrCode className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-teal-600">QRPay</p>
            <p className="text-sm text-slate-500">Product link</p>
          </div>
        </div>

        {missingLinkMessage ? (
          <p className="text-center text-slate-600">{missingLinkMessage}</p>
        ) : loading ? (
          <p className="text-center text-slate-500">Loading…</p>
        ) : error ? (
          <p className="text-center text-slate-600">{error}</p>
        ) : showPayload && data ? (
          <>
            {data.imageUrl ? (
              <div className="mb-4 flex max-h-48 justify-center overflow-hidden rounded-xl bg-slate-50">
                <img
                  src={data.imageUrl}
                  alt=""
                  className="max-h-48 w-full object-contain"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}
            <h1 className="text-2xl font-bold text-slate-900">{data.name}</h1>
            <p className="mt-1 text-slate-500">{data.category}</p>
            <p className="mt-4 text-lg font-semibold text-teal-700">{data.price}</p>
            <p className="mt-6 text-sm text-slate-600">
              <span className="font-medium text-slate-800">{data.business.name}</span>
            </p>
          </>
        ) : (
          <p className="text-center text-slate-500">Loading…</p>
        )}

        <Link
          to={APP_PATHS.root}
          className="mt-8 block text-center text-sm font-medium text-teal-600 hover:underline"
        >
          Back to QRPay
        </Link>
      </div>
    </div>
  )
}
