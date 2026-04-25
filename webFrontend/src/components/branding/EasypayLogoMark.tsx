/** Served from `webFrontend/public/easypay_logo_file.png`. */
export const EASYPAY_LOGO_PUBLIC_PATH = '/easypay_logo_file.png'

type Props = {
  className?: string
}

/** Horizontal DPay logo for headers, print, and PDF export views. */
export function EasypayLogoMark({ className }: Props) {
  return (
    <img
      src={EASYPAY_LOGO_PUBLIC_PATH}
      alt="DPay"
      className={className}
      loading="lazy"
      decoding="async"
    />
  )
}
