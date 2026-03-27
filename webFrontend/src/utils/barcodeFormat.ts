export type RetailBarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'ITF14'

/** Match backend `inferBarcodeType` for on-screen barcode previews. */
export function inferBarcodeFormat(value: string): RetailBarcodeFormat {
  const v = value.trim()
  if (/^\d{13}$/.test(v)) {
    return 'EAN13'
  }
  if (/^\d{12}$/.test(v)) {
    return 'UPC'
  }
  if (/^\d{8}$/.test(v)) {
    return 'EAN8'
  }
  if (/^\d{14}$/.test(v)) {
    return 'ITF14'
  }
  return 'CODE128'
}
