/** Hidden OrderLine SKU for partner wallet checkout. Not a merchant-managed catalogue product. */
export const INTERNAL_PARTNER_CHECKOUT_BARCODE = "__EASYPAY_INTERNAL_PARTNER_CHECKOUT__";

/** Prisma `where` fragment to hide the partner checkout SKU from catalogues and counts. */
export const NOT_INTERNAL_PARTNER_CHECKOUT_PRODUCT = {
  NOT: { barcodeValue: INTERNAL_PARTNER_CHECKOUT_BARCODE },
} as const;
