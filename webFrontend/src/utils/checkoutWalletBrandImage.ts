/** Public assets in `webFrontend/public` for checkout wallet rows by `checkoutAdapter`. */
export function checkoutWalletBrandImageSrc(checkoutAdapter: string): string | null {
  const a = checkoutAdapter.trim()
  if (a === 'aps_wallet') return '/aps_wallet.jpeg'
  if (a === 'yonna_wallet') return '/yonna_wallet.jpeg'
  if (a === 'wave_gambia' || a.startsWith('wave_')) return '/wave.jpeg'
  return null
}
