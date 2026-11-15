/**
 * Intake ticket: a short-lived, HMAC-signed statement from /api/intake/start that says
 * "this browser passed Turnstile, may upload exactly one SVG to <key>, and must then submit
 * exactly these form fields". Stateless (no Redis write before the customer finishes).
 *
 * Key = HMAC(OTL_INTAKE_HMAC_SECRET, "otl-intake-ticket-v1") so a ticket can never be
 * confused with a webhook signature made from the same secret.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const TICKET_TTL_MS = 20 * 60 * 1000;

export interface Ticket {
  v: 1;
  id: string; // submissionId
  key: string; // blob pathname the browser may upload to
  fh: string; // sha256 of the canonical form fields
  exp: number; // epoch ms
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

function ticketKey(secret: string): Buffer {
  return createHmac("sha256", secret).update("otl-intake-ticket-v1").digest();
}

/** Stable hash of the form fields (keys sorted recursively). */
export function fieldsHash(fields: unknown): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as object)
              .sort()
              .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
          )
        : v;
  return createHash("sha256").update(JSON.stringify(canon(fields))).digest("hex");
}

export function signTicket(t: Omit<Ticket, "v">, secret: string): string {
  const body = b64u(JSON.stringify({ v: 1, ...t }));
  const sig = b64u(createHmac("sha256", ticketKey(secret)).update(body).digest());
  return `${body}.${sig}`;
}

export type TicketCheck = { ok: true; ticket: Ticket } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyTicket(raw: unknown, secret: string, now = Date.now()): TicketCheck {
  if (typeof raw !== "string" || raw.length > 2048) return { ok: false, reason: "malformed" };
  const [body, sig, extra] = raw.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", ticketKey(secret)).update(body).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  let t: Ticket;
  try {
    t = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (t.v !== 1 || typeof t.id !== "string" || typeof t.key !== "string" || typeof t.fh !== "string" || typeof t.exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (now > t.exp) return { ok: false, reason: "expired" };
  return { ok: true, ticket: t };
}
