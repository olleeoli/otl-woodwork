/**
 * Signed push to the Mac through the Cloudflare tunnel (D-25, D-26).
 * Best effort: the outbox already holds the submission, so any failure here only delays it
 * until the Mac's reconciler pulls it (≤ ~5 min). Retries only on 503 / network errors.
 */
import { createHmac } from "node:crypto";
import type { IntakeConfig } from "./config";

export type ForwardResult = { ok: true; status: number; duplicate: boolean } | { ok: false; status: number | null; reason: string };

export function signBody(rawBody: string, secret: string, nowMs = Date.now()) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return { timestamp, signature };
}

export async function forwardToMac(cfg: IntakeConfig, rawBody: string, attempts = 2): Promise<ForwardResult> {
  let last: ForwardResult = { ok: false, status: null, reason: "not_attempted" };
  for (let i = 0; i < attempts; i++) {
    const { timestamp, signature } = signBody(rawBody, cfg.hmacSecret); // fresh timestamp per try
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-otl-timestamp": timestamp,
      "x-otl-signature": signature,
    };
    if (cfg.cfAccessClientId && cfg.cfAccessClientSecret) {
      headers["cf-access-client-id"] = cfg.cfAccessClientId;
      headers["cf-access-client-secret"] = cfg.cfAccessClientSecret;
    }
    try {
      const res = await fetch(cfg.hookUrl, { method: "POST", headers, body: rawBody, signal: AbortSignal.timeout(8000) });
      if (res.status === 202 || res.status === 200) return { ok: true, status: res.status, duplicate: res.status === 200 };
      last = { ok: false, status: res.status, reason: `http_${res.status}` };
      if (res.status !== 503) return last; // 4xx: retrying the same bytes won't help
    } catch (err) {
      last = { ok: false, status: null, reason: (err as Error).name === "TimeoutError" ? "timeout" : "network" };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000));
  }
  return last;
}
