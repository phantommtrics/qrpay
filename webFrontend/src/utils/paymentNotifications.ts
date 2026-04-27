const NOTIFICATION_ICON = '/app_logo.png'
const NOTIFICATION_BADGE = '/favicon-32x32.png'

export type PaymentProcessedNotification = {
  source: 'POS' | 'Orders'
  methodLabel: string
  amountLabel: string
  receiptLabel?: string | null
  orderCode?: string | null
}

function supportsNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export async function requestPaymentNotificationPermission(): Promise<boolean> {
  if (!supportsNotifications()) {
    return false
  }
  if (window.Notification.permission === 'granted') {
    return true
  }
  if (window.Notification.permission === 'denied') {
    return false
  }

  try {
    return (await window.Notification.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export async function showPaymentProcessedNotification({
  source,
  methodLabel,
  amountLabel,
  receiptLabel,
  orderCode,
}: PaymentProcessedNotification): Promise<void> {
  const canNotify = await requestPaymentNotificationPermission()
  if (!canNotify) {
    return
  }

  const details = [
    `${methodLabel} payment received: ${amountLabel}`,
    receiptLabel?.trim() || null,
    orderCode ? `Order ${orderCode}` : null,
  ].filter((part): part is string => Boolean(part))

  new window.Notification(`${source} payment processed`, {
    body: details.join(' - '),
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    tag: `directpay-payment-${Date.now()}`,
    requireInteraction: false,
  })
}
