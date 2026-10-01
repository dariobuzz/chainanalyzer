import "server-only";

/**
 * Fixed-window rate limiter.
 * The MVP uses an in-process store; the RateLimitStore interface allows a
 * Redis/Upstash implementation to be dropped in for multi-instance deploys.
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryRateLimitStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      if (this.buckets.size > 10_000) this.gc(now);
      return fresh;
    }
    b.count += 1;
    return b;
  }

  private gc(now: number) {
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}

const globalForRl = globalThis as unknown as { __csRateLimit?: RateLimitStore };
const store: RateLimitStore = (globalForRl.__csRateLimit ??= new MemoryRateLimitStore());

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export async function rateLimit(key: string, limit: number, windowMs = 60_000): Promise<RateLimitResult> {
  const { count, resetAt } = await store.increment(key, windowMs);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt, limit };
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  return ip;
}
