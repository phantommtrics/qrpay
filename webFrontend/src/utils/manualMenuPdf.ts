import JsBarcode from 'jsbarcode'
import { jsPDF } from 'jspdf'

import type { Product } from '../types'
import { inferBarcodeFormat, type RetailBarcodeFormat } from './barcodeFormat'
import { formatMoney } from './formatMoney'

export type ManualMenuPdfCategory = {
  id: string
  name: string
  products: Product[]
}

function barcodeFormatString(f: RetailBarcodeFormat): string {
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

function safePdfText(value: string): string {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/\u2013|\u2014|\u2212/g, '-')
    .replace(/\u2192|\u2794/g, ' to ')
    .replace(/\u00b7|\u2022|\u2027/g, ' | ')
    .replace(/\u2018|\u2019|\u02bc/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2026/g, '...')
}

function renderBarcode(value: string): { dataUrl: string; width: number; height: number } | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const canvas = document.createElement('canvas')
  try {
    JsBarcode(canvas, trimmed, {
      format: barcodeFormatString(inferBarcodeFormat(trimmed)),
      width: 1.8,
      height: 52,
      displayValue: true,
      fontSize: 14,
      margin: 4,
      background: '#ffffff',
    })
  } catch {
    return null
  }

  return {
    dataUrl: canvas.toDataURL('image/png'),
    width: canvas.width,
    height: canvas.height,
  }
}

export function downloadManualMenuPdf(opts: {
  businessName: string
  categories: ManualMenuPdfCategory[]
  generatedAt?: Date
}): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 36
  const gap = 14
  const cardW = (pageW - margin * 2 - gap) / 2
  const cardH = 128
  const bottom = pageH - margin
  let y = 48

  const addPage = () => {
    pdf.addPage()
    y = margin
  }

  const ensureSpace = (need: number) => {
    if (y + need > bottom) {
      addPage()
    }
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text(safePdfText(opts.businessName), margin, y)
  y += 22
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(89, 100, 117)
  const generatedAt = opts.generatedAt ?? new Date()
  pdf.text(`Manual Menu | ${generatedAt.toLocaleDateString()}`, margin, y)
  pdf.setTextColor(15, 23, 42)
  y += 26

  for (const category of opts.categories) {
    ensureSpace(40)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.text(safePdfText(category.name), margin, y)
    y += 14
    pdf.setDrawColor(20, 184, 166)
    pdf.setLineWidth(1)
    pdf.line(margin, y, pageW - margin, y)
    pdf.setDrawColor(226, 232, 240)
    y += 16

    if (category.products.length === 0) {
      ensureSpace(24)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(100, 116, 139)
      pdf.text('No products in this category.', margin, y)
      pdf.setTextColor(15, 23, 42)
      y += 24
      continue
    }

    for (let i = 0; i < category.products.length; i += 2) {
      ensureSpace(cardH + 18)
      const row = category.products.slice(i, i + 2)
      row.forEach((product, col) => {
        const x = margin + col * (cardW + gap)
        pdf.setFillColor(255, 255, 255)
        pdf.setDrawColor(226, 232, 240)
        pdf.roundedRect(x, y, cardW, cardH, 8, 8, 'FD')

        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10.5)
        pdf.setTextColor(15, 23, 42)
        const nameLines = pdf.splitTextToSize(safePdfText(product.name), cardW - 24).slice(0, 2)
        pdf.text(nameLines, x + 12, y + 20)

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        pdf.setTextColor(20, 184, 166)
        pdf.text(formatMoney(product.price, { decimals: 2 }), x + 12, y + 48)

        const barcodeValue = product.barcodeValue?.trim() ?? ''
        if (barcodeValue) {
          const barcode = renderBarcode(barcodeValue)
          if (barcode) {
            const maxW = cardW - 28
            const maxH = 44
            const aspect = barcode.width / barcode.height
            let drawW = maxW
            let drawH = drawW / aspect
            if (drawH > maxH) {
              drawH = maxH
              drawW = drawH * aspect
            }
            pdf.addImage(
              barcode.dataUrl,
              'PNG',
              x + (cardW - drawW) / 2,
              y + 66,
              drawW,
              drawH,
              undefined,
              'FAST',
            )
          } else {
            pdf.setFontSize(8.5)
            pdf.setTextColor(100, 116, 139)
            pdf.text(`Barcode: ${safePdfText(barcodeValue)}`, x + 12, y + 84)
          }
        } else {
          pdf.setFontSize(8.5)
          pdf.setTextColor(148, 163, 184)
          pdf.text('No barcode', x + 12, y + 86)
        }
      })
      y += cardH + 14
    }

    y += 8
  }

  const filename = `${opts.businessName || 'restaurant'}-manual-menu.pdf`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  pdf.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
