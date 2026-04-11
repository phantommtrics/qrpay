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

export function isProductCatalogIndustry(industry: string | null | undefined): boolean {
  return isRetailOrWholesaleIndustry(industry) || isRestaurantIndustry(industry)
}

export function isCorporateIndustry(industry: string | null | undefined): boolean {
  return normalizeIndustryLabel(industry) === 'corporate'
}
