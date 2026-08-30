import { getRedis } from "@/lib/redis";
import type { Order } from "@/types/order";

const ITEM_PREFIX = "order:item:";
const INDEX_KEY = "order:index";

/** Short, unambiguous order id. No 0/O/1/I so it can be read over the phone. */
export function newOrderId(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function saveOrder(order: Order): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");
  await redis.set(`${ITEM_PREFIX}${order.id}`, order);
  await redis.zadd(INDEX_KEY, { score: order.createdAt, member: order.id });
}

export async function getOrder(id: string): Promise<Order | null> {
  const redis = getRedis();
  if (!redis) return null;
  const order = await redis.get<Order>(`${ITEM_PREFIX}${id}`);
  return order ?? null;
}

export async function patchOrder(
  id: string,
  patch: Partial<Omit<Order, "id">>
): Promise<Order | null> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis is not configured");
  const existing = await getOrder(id);
  if (!existing) return null;
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  const updated: Order = { ...existing, ...clean };
  await redis.set(`${ITEM_PREFIX}${id}`, updated);
  return updated;
}

export async function listOrders(): Promise<Order[]> {
  const redis = getRedis();
  if (!redis) return [];
  const ids = (await redis.zrange<string[]>(INDEX_KEY, 0, -1, { rev: true })) ?? [];
  if (ids.length === 0) return [];
  const items = await redis.mget<(Order | null)[]>(
    ...ids.map((id) => `${ITEM_PREFIX}${id}`)
  );
  return items.filter((o): o is Order => o !== null && o !== undefined);
}

/**
 * Returns true exactly once per key, ever. Square retries webhook deliveries
 * and sends payment.created plus one or more payment.updated events for the
 * same payment, so every side effect has to be claimed before it runs or
 * stock gets decremented twice and the customer is emailed twice.
 */
export async function claimOnce(key: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const result = await redis.set(key, Date.now(), {
    nx: true,
    ex: 60 * 60 * 24 * 60,
  });
  return result === "OK";
}
