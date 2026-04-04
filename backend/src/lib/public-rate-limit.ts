const WINDOW_MS = 60_000;
const MAX_REQUESTS = 40;

const buckets = new Map<string, number[]>();

/** Returns true if the request is allowed, false if rate limited. */
export function allowPublicRestaurantOrder(clientKey: string): boolean {
  const now = Date.now();
  const arr = buckets.get(clientKey) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= MAX_REQUESTS) {
    return false;
  }
  pruned.push(now);
  buckets.set(clientKey, pruned);
  return true;
}
