import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Customer, MAX_UPLOAD_BYTES, Project } from "./contract";

/** What the browser sends for the form itself. Same shapes the Mac validates (02 §A). */
export const FormFields = z.strictObject({ customer: Customer, project: Project });
export type FormFields = z.infer<typeof FormFields>;

export const FileMeta = z.strictObject({
  name: z.string().min(1).max(200),
  size: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export const MAX_JSON_BYTES = 32 * 1024;

/** Parse a small JSON body; null if too big or not JSON. */
export async function readJson(req: Request): Promise<unknown | null> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_JSON_BYTES) return null;
  try {
    const text = await req.text();
    if (text.length > MAX_JSON_BYTES) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string | null {
  return req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

/** Keyed hash so the stored value can't be reversed with a lookup table of IPs. */
export function hashIp(ip: string | null, secret: string): string | undefined {
  if (!ip) return undefined;
  const key = createHmac("sha256", secret).update("otl-intake-iphash-v1").digest();
  return createHmac("sha256", key).update(ip).digest("hex").slice(0, 32);
}

export const sha256Hex = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Field paths only, never values (they hold customer PII). Form fields are reported without the "fields." prefix. */
export function issuePaths(err: z.ZodError): string[] {
  return [...new Set(err.issues.map((i) => i.path.map(String).join(".").replace(/^fields\./, "") || "(root)"))].slice(0, 20);
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "cache-control": "no-store" } });
}

/** One structured log line. Never pass customer data or secrets. */
export function logIntake(level: "info" | "warn" | "error", msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, service: "otl-intake", msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
