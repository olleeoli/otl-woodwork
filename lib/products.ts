import { getRedis } from "@/lib/redis";
import type { Product } from "@/types/product";

const ITEM_PREFIX = "product:item:";
const INDEX_KEY = "product:index";

/** "20\" Maple Lazy Susan" -> "20-maple-lazy-susan" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Slugs are the primary key and live in URLs forever, so a collision has to
 * be resolved at create time rather than silently overwriting a product.
 */
export async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title) || "product";
  let candidate = base;
  let n = 2;
  while (await getProduct(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
    if (n > 50) return `${base}-${Date.now()}`;
  }
  return candidate;
}

export async function getProduct(slug: string): Promise<Product | null> {
  const redis = getRedis();
  if (!redis) return null;
  const item = await redis.get<Product>(`${ITEM_PREFIX}${slug}`);
  return item ?? null;
}

/**
 * Newest first. Hidden products are excluded unless explicitly asked for —
 * the storefront must never leak a draft listing.
 */
export async function listProducts(
  opts: { includeHidden?: boolean } = {}
): Promise<Product[]> {
  const redis = getRedis();
  if (!redis) return [];

  const slugs =
    (await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true })) ?? [];
  if (slugs.length === 0) return [];

  const keys = slugs.map((s) => `${ITEM_PREFIX}${s}`);
  const items = await redis.mget<(Product | null)[]>(...keys);
  const products = items.filter(
    (p): p is Product => p !== null && p !== undefined
  );

  return opts.includeHidden ? products : products.filter((p) => p.active);
}

export async function saveProduct(product: Product): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");
  await redis.set(`${ITEM_PREFIX}${product.slug}`, product);
  await redis.zadd(INDEX_KEY, { score: product.order, member: product.slug });
}

export async function updateProduct(
  slug: string,
  patch: Partial<Omit<Product, "slug" | "createdAt">>
): Promise<Product | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");

  const existing = await getProduct(slug);
  if (!existing) return null;

  // Drop undefined keys so they don't blank out existing values
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  const updated: Product = { ...existing, ...clean };

  await redis.set(`${ITEM_PREFIX}${slug}`, updated);
  if (patch.order !== undefined) {
    await redis.zadd(INDEX_KEY, { score: patch.order, member: slug });
  }
  return updated;
}

export async function deleteProduct(slug: string): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");
  await redis.del(`${ITEM_PREFIX}${slug}`);
  await redis.zrem(INDEX_KEY, slug);
}
