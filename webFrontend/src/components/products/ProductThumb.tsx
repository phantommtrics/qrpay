import type { Product } from '../../types'

export function ProductThumb({
  product,
  className = '',
  size = 'md',
  imageFit = 'contain',
  imageAlt = '',
}: {
  product: Pick<Product, 'imageUrl' | 'imageColor' | 'imageEmoji'>
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'fill'
  /** `cover` fills the frame (cropped, centered); `contain` shows the full image. */
  imageFit?: 'contain' | 'cover'
  imageAlt?: string
}) {
  const sizeClass =
    size === 'fill'
      ? 'h-full w-full min-h-0 min-w-0 text-5xl sm:text-6xl'
      : size === 'sm'
        ? 'h-12 w-12 min-h-12 min-w-12 text-2xl'
        : size === 'lg'
          ? 'h-32 w-full min-h-32 text-5xl'
          : 'h-24 w-24 min-h-24 min-w-24 text-4xl'

  if (product.imageUrl) {
    const frameBg = imageFit === 'cover' ? 'bg-slate-100' : 'bg-white'
    const objectClass =
      imageFit === 'cover' ? 'object-cover object-center' : 'object-contain object-center'
    return (
      <div
        className={`flex items-center justify-center overflow-hidden rounded-xl ${frameBg} ${size === 'fill' ? '' : 'shrink-0'} ${sizeClass} ${className}`}
      >
        <img
          src={product.imageUrl}
          alt={imageAlt}
          className={`h-full w-full ${objectClass}`}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    )
  }

  return (
    <div
      className={`flex items-center justify-center rounded-xl ${product.imageColor} ${size === 'fill' ? '' : 'shrink-0'} ${sizeClass} ${className}`}
    >
      {product.imageEmoji.trim() ? product.imageEmoji : '📦'}
    </div>
  )
}
