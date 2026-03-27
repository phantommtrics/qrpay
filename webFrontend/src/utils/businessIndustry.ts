export function normalizeIndustryLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase()
}

export function isRetailOrWholesaleIndustry(industry: string | null | undefined): boolean {
  const n = normalizeIndustryLabel(industry)
  return n === 'retail' || n === 'wholesale'
}
