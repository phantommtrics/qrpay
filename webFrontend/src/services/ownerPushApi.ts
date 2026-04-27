import { apiRequest } from './salesApi'

export async function fetchWebPushPublicKey(): Promise<string | null> {
  const res = await apiRequest<{ data: { publicKey: string | null } }>('/web-push/public-key', {
    method: 'GET',
  })
  return res.data.publicKey
}

export async function saveOwnerPushSubscription(
  businessId: string,
  subscription: PushSubscription,
): Promise<void> {
  await apiRequest<unknown>(`/businesses/${businessId}/owner-push-subscriptions`, {
    method: 'POST',
    businessId,
    body: JSON.stringify(subscription.toJSON()),
  })
}
