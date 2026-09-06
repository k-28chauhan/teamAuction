const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Bucket = { count: number; windowStart: number };

/** In-memory is fine at this scale (see backend PRD section 3) — one process, small group. */
const buckets = new Map<string, Bucket>();

export function recordPinAttempt(username: string): { allowed: boolean } {
  const key = username.toLowerCase();
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false };
  }

  bucket.count += 1;
  return { allowed: true };
}

export function clearPinAttempts(username: string): void {
  buckets.delete(username.toLowerCase());
}
