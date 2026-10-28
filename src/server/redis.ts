import IORedis, { type Redis } from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { __flRedis?: Redis | null };

/** Shared Redis connection, or null when REDIS_URL is not configured. */
export function redis(): Redis | null {
  if (g.__flRedis !== undefined) return g.__flRedis;
  const url = env().REDIS_URL;
  if (!url) {
    g.__flRedis = null;
    return null;
  }
  g.__flRedis = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    family: url.includes(".railway.internal") ? 6 : 0,
    lazyConnect: false,
  });
  g.__flRedis.on("error", (err) => console.error("[redis]", err.message));
  return g.__flRedis;
}

/** BullMQ needs its own connections with the same options. */
export function redisConnectionOptions() {
  const url = env().REDIS_URL;
  if (!url) return null;
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: decodeURIComponent(u.password || "") || undefined,
    tls: u.protocol === "rediss:" ? {} : undefined,
    family: u.hostname.endsWith(".railway.internal") ? 6 : 0,
    maxRetriesPerRequest: null,
  };
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

/**
 * Fixed-window rate limiter. Returns true when the action is allowed.
 * Falls back to process memory when Redis is unavailable.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const r = redis();
  const k = `rl:${key}`;
  if (r && r.status === "ready") {
    try {
      const count = await r.incr(k);
      if (count === 1) await r.expire(k, windowSeconds);
      return count <= limit;
    } catch {
      /* fall through to memory */
    }
  }
  const now = Date.now();
  const b = memoryBuckets.get(k);
  if (!b || b.resetAt < now) {
    memoryBuckets.set(k, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
