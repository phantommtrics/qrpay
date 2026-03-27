import type { Product } from '../../types'

export function ProductThumb({
  product,
  className = '',
  size = 'md',
}: {
  product: Pick<Product, 'imageUrl' | 'imageColor' | 'imageEmoji'>
  className?: string
  size?: 'sm' | 'md' | 'lg'
}) {
  const sizeClass =
    size === 'sm'
      ? 'h-12 w-12 min-h-12 min-w-12 text-2xl'
      : size === 'lg'
        ? 'h-32 w-full min-h-32 text-5xl'
        : 'h-24 w-24 min-h-24 min-w-24 text-4xl'

  if (product.imageUrl) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${sizeClass} ${className}`}
      >
        <img
          src={product.imageUrl}
          alt=""
          className="h-full w-full object-contain"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl ${product.imageColor} ${sizeClass} ${className}`}
    >
      {product.imageEmoji}
    </div>
  )
}
