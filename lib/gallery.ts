import { Redis } from "@upstash/redis";
import type { GalleryItem } from "@/types/gallery";

const ITEM_PREFIX = "gallery:item:";
const INDEX_KEY = "gallery:index";

/**
 * Vercel's Upstash integration injects KV_REST_API_* ; a direct Upstash
 * integration injects UPSTASH_REDIS_REST_* . Accept either so the project
 * works no matter which way the store was connected.
 */
function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) return null;

  // The client defaults to fetch(cache: "no-store"), which forces the
  // statically-rendered homepage into dynamic mode at runtime and makes it
  // error out. "default" avoids that bail-out; Next never caches POST
  // requests (which is all Upstash sends), so reads stay fresh.
  return new Redis({ url, token, cache: "default" });
}

/** True when a Redis store is configured. Used to show a helpful setup hint. */
export function isStorageConfigured(): boolean {
  return getRedis() !== null;
}

export async function saveGalleryItem(item: GalleryItem): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");
  await redis.set(`${ITEM_PREFIX}${item.id}`, item);
  await redis.zadd(INDEX_KEY, { score: item.order, member: item.id });
}

export async function getGalleryItem(id: string): Promise<GalleryItem | null> {
  const redis = getRedis();
  if (!redis) return null;
  const item = await redis.get<GalleryItem>(`${ITEM_PREFIX}${id}`);
  return item ?? null;
}

export async function listGalleryItems(): Promise<GalleryItem[]> {
  const redis = getRedis();
  if (!redis) return [];

  // Newest first
  const ids = (await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true })) ?? [];
  if (ids.length === 0) return [];

  const keys = ids.map((id) => `${ITEM_PREFIX}${id}`);
  const items = await redis.mget<(GalleryItem | null)[]>(...keys);
  return items.filter((i): i is GalleryItem => i !== null && i !== undefined);
}

export async function deleteGalleryItem(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");
  await redis.del(`${ITEM_PREFIX}${id}`);
  await redis.zrem(INDEX_KEY, id);
}

export async function updateGalleryItem(
  id: string,
  patch: Partial<Pick<GalleryItem, "title" | "category" | "description" | "order">>
): Promise<GalleryItem | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");

  const existing = await getGalleryItem(id);
  if (!existing) return null;

  // Drop undefined keys so they don't overwrite existing values
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  const updated: GalleryItem = { ...existing, ...clean };

  await redis.set(`${ITEM_PREFIX}${id}`, updated);
  if (patch.order !== undefined) {
    await redis.zadd(INDEX_KEY, { score: patch.order, member: id });
  }
  return updated;
}
