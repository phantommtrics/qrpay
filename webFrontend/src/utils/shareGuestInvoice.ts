export function invoiceShareMessage(input: {
  businessName: string
  publicCode: string
  amountLabel: string
  guestPayUrl: string
}): string {
  return `${input.businessName} invoice ${input.publicCode} (${input.amountLabel}). View and pay here:\n${input.guestPayUrl}`
}

export function invoiceShareBundleMessage(input: {
  businessName: string
  invoiceCount: number
  publicUrl: string
}): string {
  const n = input.invoiceCount
  const noun = n === 1 ? 'invoice' : 'invoices'
  return `${input.businessName} ${n} ${noun}. View each contact and pay here:\n${input.publicUrl}`
}

export function whatsappShareHref(text: string, phone?: string | null): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  const base = digits.length >= 8 ? `https://wa.me/${digits}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(text)}`
}

export async function shareLinkAndPdf(input: {
  title: string
  text: string
  url: string
  file: File
}): Promise<'shared' | 'aborted'> {
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
  }
  try {
    if (typeof nav.share === 'function') {
      if (typeof nav.canShare === 'function' && nav.canShare({ files: [input.file] })) {
        await nav.share({ title: input.title, text: input.text, files: [input.file] })
        return 'shared'
      }
      await nav.share({ title: input.title, text: input.text, url: input.url })
      return 'shared'
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return 'aborted'
    }
  }
  throw new Error('Share is not available on this device.')
}
