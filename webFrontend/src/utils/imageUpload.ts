/** Aligned with backend multer `limits.fileSize` for product images */
export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export const PRODUCT_IMAGE_ACCEPT_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const

export function validateProductImageFile(file: File): string | null {
  if (!PRODUCT_IMAGE_ACCEPT_MIME.includes(file.type as (typeof PRODUCT_IMAGE_ACCEPT_MIME)[number])) {
    return 'Use a JPEG, PNG, WebP, or GIF image.'
  }
  return null
}

/** True when the file exceeds the server upload limit (we compress client-side before POST). */
export function productImageExceedsUploadLimit(file: File): boolean {
  return file.size > PRODUCT_IMAGE_MAX_BYTES
}

/**
 * Downscale large photos so uploads stay under the API limit and load faster.
 * GIFs are returned unchanged (avoid breaking animation).
 */
export async function prepareProductImageForUpload(file: File): Promise<File> {
  if (file.type === 'image/gif') {
    return file
  }

  const maxEdge = 1600
  const quality = 0.88

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const { width, height } = img
    if (width <= maxEdge && height <= maxEdge && file.size <= PRODUCT_IMAGE_MAX_BYTES) {
      return file
    }

    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return file
    }
    ctx.drawImage(img, 0, 0, w, h)

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality),
    )
    if (!blob || blob.size === 0) {
      return file
    }

    let out = new File([blob], stripExtension(file.name) + '.jpg', { type: 'image/jpeg' })
    let q = quality
    while (out.size > PRODUCT_IMAGE_MAX_BYTES && q > 0.45) {
      q -= 0.1
      const b2: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', q),
      )
      if (!b2) {
        break
      }
      out = new File([b2], stripExtension(file.name) + '.jpg', { type: 'image/jpeg' })
    }

    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}

function stripExtension(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read image.'))
    img.src = url
  })
}
