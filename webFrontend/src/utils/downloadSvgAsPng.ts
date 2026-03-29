/** Safe filename segment for downloads (no path chars). */
export function sanitizeDownloadBasename(name: string): string {
  const s = name
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return s.slice(0, 48) || 'product'
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not rasterize SVG.'))
    img.src = url
  })
}

/**
 * Renders an inline SVG to a PNG file download (white background, high resolution).
 */
export async function downloadSvgAsPng(svg: SVGSVGElement | null | undefined, filename: string) {
  if (!svg) {
    throw new Error('Nothing to export.')
  }

  let serialized = new XMLSerializer().serializeToString(svg)
  if (!serialized.includes('xmlns=')) {
    serialized = serialized.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' })
  const objectUrl = URL.createObjectURL(svgBlob)

  try {
    const img = await loadImage(objectUrl)
    const w = img.naturalWidth || svg.clientWidth || 256
    const h = img.naturalHeight || svg.clientHeight || 256
    const scale = 3

    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(w * scale))
    canvas.height = Math.max(1, Math.ceil(h * scale))

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Canvas is not available.')
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png', 1),
    )

    if (!pngBlob) {
      throw new Error('Could not create PNG.')
    }

    const name = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`
    const a = document.createElement('a')
    const pngUrl = URL.createObjectURL(pngBlob)
    a.href = pngUrl
    a.download = name
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(pngUrl), 2500)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
