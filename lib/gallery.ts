import { getRedis } from "@/lib/redis";
import type { GalleryItem } from "@/types/gallery";

const ITEM_PREFIX = "gallery:item:";
const INDEX_KEY = "gallery:index";

/** Re-exported from lib/redis so existing imports from here keep working. */
export { isStorageConfigured } from "@/lib/redis";

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
