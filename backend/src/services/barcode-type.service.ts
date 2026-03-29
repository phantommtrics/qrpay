/** Barcode symbology for storage and client previews (EAN-13 retail packages, etc.). */
export function inferBarcodeType(barcodeValue: string): string {
  const v = barcodeValue.trim();
  if (/^\d{13}$/.test(v)) {
    return "EAN13";
  }
  if (/^\d{12}$/.test(v)) {
    return "UPC";
  }
  if (/^\d{8}$/.test(v)) {
    return "EAN8";
  }
  if (/^\d{14}$/.test(v)) {
    return "ITF14";
  }
  return "CODE128";
}
