import { useEffect } from 'react'

import { useAuth } from '../auth/AuthContext'
import {
  fetchWebPushPublicKey,
  saveOwnerPushSubscription,
} from '../../services/ownerPushApi'

const OWNER_PUSH_SW_URL = '/owner-push/sw.js'

function urlBase64ToArrayBuffer(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = `${base64String}${padding}`.replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }

  return outputArray.buffer
}

async function ensureOwnerPushSubscription(businessId: string): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return
  }
  if (window.Notification.permission === 'denied') {
    return
  }

  const publicKey = await fetchWebPushPublicKey()
  if (!publicKey) {
    return
  }

  const permission =
    window.Notification.permission === 'granted'
      ? 'granted'
      : await window.Notification.requestPermission()
  if (permission !== 'granted') {
    return
  }

  const registration = await navigator.serviceWorker.register(OWNER_PUSH_SW_URL)
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    }))

  await saveOwnerPushSubscription(businessId, subscription)
}

export function OwnerPushRegistration() {
  const { currentOrganization, user } = useAuth()
  const businessId = currentOrganization?.id
  const isOwner = Boolean(currentOrganization?.isOwner)

  useEffect(() => {
    if (!businessId || !user || !isOwner || user.isPlatformOwner || user.isPlatformAdmin) {
      return
    }

    void ensureOwnerPushSubscription(businessId).catch(() => {
      /* Push registration is best-effort; payment flows must not depend on it. */
    })
  }, [businessId, isOwner, user])

  return null
}
