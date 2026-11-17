/**
 * Mac → Vercel: hand the Mac the uploaded SVG for one submission (Step 2.6, D-39).
 * The Mac never holds a Blob token; it signs { submissionId, key } with the intake secret
 * (derived key, see file-auth.ts) and gets back the bytes of that one file — and only if the
 * submission really exists in the outbox with exactly that file key.
 *
 *   200 file bytes (application/octet-stream) · 401 bad/stale signature · 400/422 bad body
 *   404 no such submission / key mismatch / file gone · 413 file > 5 MiB · 503 try again later
 */
import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readCapped } from "@/lib/otl-intake/blob-read";
import { FILE_KEY_PATTERN, MAX_UPLOAD_BYTES, SubmissionId } from "@/lib/otl-intake/contract";
import { intakeConfig } from "@/lib/otl-intake/config";
import { verifyFileRequest } from "@/lib/otl-intake/file-auth";
import { jsonError, logIntake } from "@/lib/otl-intake/http";
import { outboxClient, outboxKey } from "@/lib/otl-intake/outbox";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY = 1024;
const FileRequest = z
  .strictObject({ submissionId: SubmissionId, key: z.string().regex(FILE_KEY_PATTERN) })
  .refine((b) => b.key.startsWith(`intake/${b.submissionId}/`), { path: ["key"], message: "S-1" });

export async function POST(req: Request) {
  const cfg = intakeConfig();
  if (!cfg) return jsonError(503, "unavailable");

  const raw = await req.text();
  if (raw.length > MAX_BODY) return jsonError(413, "payload_too_large");
  const sig = verifyFileRequest(raw, req.headers.get("x-otl-timestamp"), req.headers.get("x-otl-signature"), cfg.hmacSecret);
  if (!sig.ok) {
    logIntake("warn", "file fetch: signature rejected", { reason: sig.reason });
    return jsonError(401, "unauthorized");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return jsonError(400, "invalid_json");
  }
  const body = FileRequest.safeParse(json);
  if (!body.success) return jsonError(422, "invalid_payload");
  const { submissionId, key } = body.data;

  // Only files that belong to a real submission: the outbox record must name exactly this key.
  try {
    const rec = await outboxClient(cfg).get<string>(outboxKey(submissionId));
    const fileKey = rec ? (JSON.parse(rec) as { payload?: { file?: { key?: string } } }).payload?.file?.key : undefined;
    if (fileKey !== key) {
      logIntake("warn", "file fetch: no matching submission", { submissionId, found: Boolean(rec) });
      return jsonError(404, "not_found");
    }
  } catch (err) {
    logIntake("error", "file fetch: outbox read failed", { submissionId, err: (err as Error).name });
    return jsonError(503, "unavailable");
  }

  let bytes: Uint8Array;
  try {
    const blob = await get(key, { access: "private", token: cfg.blobToken, useCache: false });
    if (!blob || blob.statusCode !== 200 || !blob.stream) return jsonError(404, "not_found");
    bytes = await readCapped(blob.stream, MAX_UPLOAD_BYTES);
  } catch (err) {
    if ((err as Error).message === "too_large") return jsonError(413, "payload_too_large");
    logIntake("error", "file fetch: blob read failed", { submissionId, err: (err as Error).name });
    return jsonError(503, "unavailable");
  }

  logIntake("info", "file fetch: served", { submissionId, bytes: bytes.byteLength });
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
