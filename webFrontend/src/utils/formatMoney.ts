export function formatMoney(
  value: number,
  options?: {
    decimals?: number
  },
) {
  const decimals = options?.decimals ?? 2

  return `D${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}
