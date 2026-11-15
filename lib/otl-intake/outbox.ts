/**
 * Upstash outbox writer (02 §D, D-27). Dedicated database `otl-intake`, never the storefront's.
 * Rule O-1: record + pending entry in ONE MULTI, before the webhook is sent.
 */
import { Redis } from "@upstash/redis";
import type { IntakeWebhook } from "./contract";
import type { IntakeConfig } from "./config";

export const OUTBOX_PENDING_KEY = "intake:pending";
export const OUTBOX_RECORD_TTL_SEC = 30 * 24 * 3600;
export const outboxKey = (id: string) => `intake:${id}`;

export function outboxClient(cfg: IntakeConfig): Redis {
  return new Redis({
    url: cfg.upstashUrl,
    token: cfg.upstashToken,
    automaticDeserialization: false,
    cache: "default",
    retry: { retries: 2 },
  });
}

/**
 * Store a new submission as RECEIVED. Idempotent: if the record already exists (double click,
 * retry), it is left untouched so a record the Mac already acked is never reset.
 * Returns "exists" in that case.
 */
export async function writeOutbox(redis: Redis, payload: IntakeWebhook, createdAt: Date): Promise<"written" | "exists"> {
  const key = outboxKey(payload.submissionId);
  if ((await redis.exists(key)) === 1) return "exists";
  const record = JSON.stringify({
    schemaVersion: "1.0",
    status: "RECEIVED",
    payload,
    createdAt: createdAt.toISOString(),
  });
  const tx = redis.multi();
  tx.set(key, record, { ex: OUTBOX_RECORD_TTL_SEC });
  tx.zadd(OUTBOX_PENDING_KEY, { score: createdAt.getTime(), member: payload.submissionId });
  await tx.exec();
  return "written";
}
