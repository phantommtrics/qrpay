import { toBlob, toCanvas } from 'html-to-image'

/**
 * Captures a DOM subtree as a bitmap using `html-to-image` (SVG foreignObject).
 *
 * Font embedding reads `document.styleSheets[].cssRules`, which throws SecurityError for
 * cross-origin stylesheets (e.g. Google Fonts). `html-to-image` checks `fontEmbedCSS != null`
 * *before* `skipFonts`; we set `fontEmbedCSS: ''` so the embed step is skipped entirely
 * (empty string is not null, but `if (cssText)` is false — no @font-face inlining, no cssRules walk).
 */
const BASE_CAPTURE_OPTIONS = {
  pixelRatio: 2,
  cacheBust: true,
  backgroundColor: '#ffffff',
  skipFonts: true,
  fontEmbedCSS: '',
} as const

async function waitForRender() {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

async function rasterizeElement(element: HTMLElement): Promise<HTMLCanvasElement> {
  await waitForRender()
  return toCanvas(element, BASE_CAPTURE_OPTIONS)
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2500)
}

/** Save a PNG blob as a file download (no DOM capture). */
export function downloadImageBlob(blob: Blob, filename: string): void {
  const name = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`
  triggerDownload(blob, name)
}

/** Rasterize a DOM subtree to a PNG blob (e.g. for Web Share API or custom download). */
export async function captureElementAsPngBlob(element: HTMLElement): Promise<Blob> {
  await waitForRender()
  const blob = await toBlob(element, {
    ...BASE_CAPTURE_OPTIONS,
    type: 'image/png',
    quality: 1,
  })
  if (!blob) {
    throw new Error('Could not create PNG.')
  }
  return blob
}

/**
 * Rasterizes a DOM node (e.g. table tent card) to a PNG download.
 */
export async function downloadHtmlElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  const pngBlob = await captureElementAsPngBlob(element)
  downloadImageBlob(pngBlob, filename)
}

export type RasterImageFormat = 'image/png' | 'image/jpeg' | 'image/webp'

/**
 * Rasterizes a DOM node to a downloadable bitmap (PNG, JPEG, or WebP when the browser supports it).
 */
export async function downloadHtmlElementAsImage(
  element: HTMLElement,
  filename: string,
  format: RasterImageFormat,
  quality = 0.92,
): Promise<void> {
  await waitForRender()
  const mime = format
  const ext =
    mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'

  const blob = await toBlob(element, {
    ...BASE_CAPTURE_OPTIONS,
    type: mime,
    quality: mime === 'image/png' ? 1 : quality,
  })

  if (!blob) {
    throw new Error(`Could not create ${ext.toUpperCase()} image.`)
  }

  const lower = filename.toLowerCase()
  const name = lower.endsWith(`.${ext}`) ? filename : `${filename}.${ext}`
  triggerDownload(blob, name)
}

/**
 * Fits a raster image on a single A4 page (portrait or landscape PDF).
 */
export async function downloadHtmlElementAsPdf(
  element: HTMLElement,
  filename: string,
  pageLayout: 'portrait' | 'landscape',
): Promise<void> {
  const canvas = await rasterizeElement(element)
  const imgData = canvas.toDataURL('image/png', 1)

  const { jsPDF } = await import('jspdf')
  const orientation = pageLayout === 'landscape' ? 'landscape' : 'portrait'
  const pdf = new jsPDF({ orientation, unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 28
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const pw = canvas.width
  const ph = canvas.height
  const ratio = Math.min(maxW / pw, maxH / ph)
  const w = pw * ratio
  const h = ph * ratio
  const x = margin + (maxW - w) / 2
  const y = margin + (maxH - h) / 2

  pdf.addImage(imgData, 'PNG', x, y, w, h, undefined, 'SLOW')
  const name = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`
  pdf.save(name)
}
