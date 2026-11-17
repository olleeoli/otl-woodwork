/**
 * Mac → Vercel file fetch signature (Step 2.6, D-39). Same shared secret as the intake webhook,
 * but a derived key and its own prefix, so a signature made for one direction can never be
 * replayed in the other:
 *   key       = HMAC-SHA256(OTL_INTAKE_HMAC_SECRET, "otl-intake-file-v1")
 *   signature = hex HMAC-SHA256(key, `otl-file-v1.${timestamp}.${rawBody}`), timestamp = unix seconds
 * Must stay byte-identical to otl-pipeline src/files/intake-file.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const FILE_SIG_MAX_SKEW_SEC = 300;

const fileKey = (secret: string) => createHmac("sha256", secret).update("otl-intake-file-v1").digest();

export function signFileRequest(rawBody: string, secret: string, nowMs = Date.now()) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac("sha256", fileKey(secret)).update(`otl-file-v1.${timestamp}.${rawBody}`).digest("hex");
  return { timestamp, signature };
}

export type FileSigCheck = { ok: true } | { ok: false; reason: "missing" | "stale" | "bad_signature" };

export function verifyFileRequest(rawBody: string, timestamp: string | null, signature: string | null, secret: string, nowMs = Date.now()): FileSigCheck {
  if (!timestamp || !signature || !/^\d{10}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: "missing" };
  if (Math.abs(Math.floor(nowMs / 1000) - Number(timestamp)) > FILE_SIG_MAX_SKEW_SEC) return { ok: false, reason: "stale" };
  const expected = createHmac("sha256", fileKey(secret)).update(`otl-file-v1.${timestamp}.${rawBody}`).digest();
  const got = Buffer.from(signature, "hex");
  return got.length === expected.length && timingSafeEqual(got, expected) ? { ok: true } : { ok: false, reason: "bad_signature" };
}
