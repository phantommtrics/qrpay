/**
 * Prisma enum *values* for sales (Order, Payment, …).
 * Duplicated from prisma/schema.prisma so we do not depend on `@prisma/client`
 * re-exporting runtime enum objects (some TS/IDE setups fail to resolve them).
 */
export const OrderStatus = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PAID: "PAID",
  CANCELLED: "CANCELLED",
} as const;

export type OrderStatusType = (typeof OrderStatus)[keyof typeof OrderStatus];

export const PaymentStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type PaymentStatusType = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  QR_WALLET: "QR_WALLET",
  CASH: "CASH",
} as const;

export type PaymentMethodType = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentProvider = {
  SIMULATOR: "SIMULATOR",
} as const;

export type PaymentProviderType = (typeof PaymentProvider)[keyof typeof PaymentProvider];
