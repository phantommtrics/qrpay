type RateLimitOptions = {
  windowMs: number;
  maxRequests: number;
};

const buckets = new Map<string, number[]>();

function pruneBucket(key: string, now: number, windowMs: number): number[] {
  const arr = buckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < windowMs);
  if (pruned.length === 0) {
    buckets.delete(key);
    return pruned;
  }
  buckets.set(key, pruned);
  return pruned;
}

/** Returns true if the request is allowed, false if rate limited. */
export function allowRateLimitedAction(
  scope: string,
  clientKey: string,
  options: RateLimitOptions,
): boolean {
  const now = Date.now();
  const key = `${scope}:${clientKey}`;
  const pruned = pruneBucket(key, now, options.windowMs);
  if (pruned.length >= options.maxRequests) {
    return false;
  }
  pruned.push(now);
  buckets.set(key, pruned);
  return true;
}

export function allowPublicRestaurantOrder(clientKey: string): boolean {
  return allowRateLimitedAction("public-restaurant-order", clientKey, {
    windowMs: 60_000,
    maxRequests: 40,
  });
}
