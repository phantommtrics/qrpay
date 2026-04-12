import JsBarcode from 'jsbarcode'
import { jsPDF } from 'jspdf'

import { inferBarcodeFormat, type RetailBarcodeFormat } from './barcodeFormat'

/** Page margins (mm); barcode scales to maximize within printable area. */
const MARGIN_MM = 12

function jsBarcodeFormatString(f: RetailBarcodeFormat): string {
  switch (f) {
    case 'EAN13':
      return 'EAN13'
    case 'EAN8':
      return 'EAN8'
    case 'UPC':
      return 'UPC'
    case 'ITF14':
      return 'ITF14'
    case 'CODE128':
    default:
      return 'CODE128'
  }
}

/** High-res canvas for sharp scaling when the image fills A4. */
function renderBarcodeCanvasForPrint(value: string): HTMLCanvasElement {
  const trimmed = value.trim()
  const format = inferBarcodeFormat(trimmed)
  const canvas = document.createElement('canvas')
  JsBarcode(canvas, trimmed, {
    format: jsBarcodeFormatString(format),
    width: 2.4,
    height: 140,
    displayValue: true,
    fontSize: 24,
    margin: 10,
    background: '#ffffff',
  })
  return canvas
}

/**
 * Single A4 portrait page with only the barcode image scaled to fill the page
 * (within margins). No product name. Print at 100% scale.
 */
export async function downloadBarcodeFullPagePdf(
  barcodeValue: string,
  filename: string,
): Promise<void> {
  const trimmed = barcodeValue.trim()
  if (!trimmed) {
    throw new Error('No barcode to export.')
  }

  let canvas: HTMLCanvasElement
  try {
    canvas = renderBarcodeCanvasForPrint(trimmed)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid barcode value.'
    throw new Error(msg)
  }

  const dataUrl = canvas.toDataURL('image/png')
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const maxW = pageW - 2 * MARGIN_MM
  const maxH = pageH - 2 * MARGIN_MM

  const cw = canvas.width
  const ch = canvas.height
  const aspect = cw / ch
  let drawW = maxW
  let drawH = drawW / aspect
  if (drawH > maxH) {
    drawH = maxH
    drawW = drawH * aspect
  }

  const x = MARGIN_MM + (maxW - drawW) / 2
  const y = MARGIN_MM + (maxH - drawH) / 2

  pdf.addImage(dataUrl, 'PNG', x, y, drawW, drawH, undefined, 'FAST')

  const name = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`
  pdf.save(name)
}
