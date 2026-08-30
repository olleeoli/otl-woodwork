import { Redis } from "@upstash/redis";

/**
 * Vercel's Upstash integration injects KV_REST_API_* ; a direct Upstash
 * integration injects UPSTASH_REDIS_REST_* . Accept either so the project
 * works no matter which way the store was connected.
 */
export function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  // The client defaults to fetch(cache: "no-store"), which forces statically
  // rendered pages into dynamic mode at runtime and makes them error out.
  // "default" avoids that bail-out; Next never caches POST requests (which is
  // all Upstash sends), so reads stay fresh.
  return new Redis({ url, token, cache: "default" });
}

/** True when a Redis store is configured. Used to show a helpful setup hint. */
export function isStorageConfigured(): boolean {
  return getRedis() !== null;
}
