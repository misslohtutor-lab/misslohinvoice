const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const hits = new Map<string, number[]>();

export function rateLimit(key: string): boolean {
  const now = Date.now();
  const bucketStart = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((t) => t > bucketStart);
  if (recent.length >= MAX_ATTEMPTS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  if (recent.length > MAX_ATTEMPTS) recent.shift();
  hits.set(key, recent);
  return true;
}