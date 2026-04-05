import html2canvas from 'html2canvas'

/** html2canvas cannot parse Tailwind v4 / modern CSS color functions from stylesheets. */
const UNSUPPORTED_IN_RASTER_COLOR_RE =
  /oklab\s*\(|oklch\s*\(|\blab\s*\(|\blch\s*\(|color-mix\s*\(|color\s*\(/i

async function waitForRender() {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })
}

/**
 * Strip stylesheet-based rules from the clone (they often contain `oklab()` / `oklch()`),
 * then copy resolved computed styles from the live DOM so html2canvas only sees `rgb()` etc.
 */
function prepareClonedSubtreeForHtml2Canvas(
  clonedDoc: Document,
  clonedRoot: HTMLElement,
  originalRoot: HTMLElement,
): void {
  clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove())

  const walk = (orig: Element, clone: Element): void => {
    if (orig instanceof HTMLElement && clone instanceof HTMLElement) {
      const cs = window.getComputedStyle(orig)
      const chunks: string[] = []
      for (let i = 0; i < cs.length; i++) {
        const prop = cs.item(i)
        if (!prop || prop.startsWith('--')) continue
        const value = cs.getPropertyValue(prop)
        if (!value) continue
        if (UNSUPPORTED_IN_RASTER_COLOR_RE.test(value)) continue
        chunks.push(`${prop}: ${value}`)
      }
      clone.setAttribute('style', chunks.join('; '))
      clone.removeAttribute('class')
    } else {
      clone.removeAttribute('class')
    }

    const n = Math.min(orig.children.length, clone.children.length)
    for (let i = 0; i < n; i++) {
      walk(orig.children[i], clone.children[i])
    }
  }

  walk(originalRoot, clonedRoot)
}

function html2canvasOptionsForElement(element: HTMLElement) {
  return {
    scale: 2,
    useCORS: true,
    allowTaint: false,
    logging: false,
    backgroundColor: '#ffffff',
    onclone: (clonedDoc: Document, clonedElement: HTMLElement) => {
      prepareClonedSubtreeForHtml2Canvas(clonedDoc, clonedElement, element)
    },
  } as const
}

/**
 * Rasterizes a DOM node (e.g. table tent card) to a PNG download.
 */
export async function downloadHtmlElementAsPng(element: HTMLElement, filename: string): Promise<void> {
  await waitForRender()
  const canvas = await html2canvas(element, html2canvasOptionsForElement(element))
  const pngBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png', 1),
  )
  if (!pngBlob) {
    throw new Error('Could not create PNG.')
  }
  const name = filename.toLowerCase().endsWith('.png') ? filename : `${filename}.png`
  const url = URL.createObjectURL(pngBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 2500)
}

/**
 * Fits a raster image on a single A4 page (portrait or landscape PDF).
 */
export async function downloadHtmlElementAsPdf(
  element: HTMLElement,
  filename: string,
  pageLayout: 'portrait' | 'landscape',
): Promise<void> {
  await waitForRender()
  const canvas = await html2canvas(element, html2canvasOptionsForElement(element))
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
