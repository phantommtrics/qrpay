export function normalizeIndustryLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

/** Retail-style catalogue: category + barcode flow (excludes restaurant menu). */
export function isRetailOrWholesaleIndustry(industry: string | null | undefined): boolean {
  const n = normalizeIndustryLabel(industry)
  return n === 'retail' || n === 'wholesale' || n === 'pharmacy'
}

export function isRestaurantIndustry(industry: string | null | undefined): boolean {
  return normalizeIndustryLabel(industry) === 'restaurant'
}

/** Signup label: "Petrol station" — fuel-only POS with pump tracking and liter quantities. */
export function isPetrolStationIndustry(industry: string | null | undefined): boolean {
  const n = normalizeIndustryLabel(industry)
  return n === 'petrol station' || n === 'petrol_station'
}

export function isProductCatalogIndustry(industry: string | null | undefined): boolean {
  return (
    isRetailOrWholesaleIndustry(industry) ||
    isRestaurantIndustry(industry) ||
    isPetrolStationIndustry(industry)
  )
}

export function isCorporateIndustry(industry: string | null | undefined): boolean {
  return normalizeIndustryLabel(industry) === 'corporate'
}
