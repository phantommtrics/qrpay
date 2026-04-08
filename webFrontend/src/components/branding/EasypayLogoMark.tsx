/** Served from `webFrontend/public/easypay_logo_file.jpeg`. */
export const EASYPAY_LOGO_PUBLIC_PATH = '/easypay_logo_file.jpeg'

type Props = {
  className?: string
}

/** Horizontal EasyPay logo for headers, print, and PDF export views. */
export function EasypayLogoMark({ className }: Props) {
  return (
    <img
      src={EASYPAY_LOGO_PUBLIC_PATH}
      alt="EasyPay"
      className={className}
      loading="lazy"
      decoding="async"
    />
  )
}
